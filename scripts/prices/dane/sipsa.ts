import { z } from "zod";

// DANE SIPSA web service (public, official data: "Fuente: DANE - SIPSA").
// SOAP 1.2, operation promediosSipsaSemanaMadr: weekly wholesale prices (COP
// per kg) of every wholesale market. The answer is untrusted text: it is
// checked here before anything reaches the database.

export const SIPSA_ENDPOINT = "https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService";
export const SIPSA_MARKET = "Bucaramanga, Centroabastos";

const NAMESPACE = "http://servicios.sipsa.co.gov.dane/";
const REQUEST_TIMEOUT_MS = 180_000;
/** The full history answer is about 66 MB; refuse anything far beyond that. */
const MAX_BODY_BYTES = 200_000_000;

export class SipsaError extends Error {
  constructor(message: string) {
    super(`SIPSA: ${message}`);
    this.name = "SipsaError";
  }
}

export interface SipsaRow {
  artiId: number;
  name: string;
  /** First day of the week, YYYY-MM-DD. */
  weekStart: string;
  /** Average wholesale price in COP per kg (per unit for eggs). */
  pricePerKg: number;
}

export function buildWeeklyRequest(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ser="${NAMESPACE}">` +
    "<soap:Body><ser:promediosSipsaSemanaMadr/></soap:Body></soap:Envelope>"
  );
}

/** One polite request (no retries). The body is size-capped; no secrets are involved. */
export async function fetchWeekly(
  fetchFn: typeof fetch,
  options: { maxBytes?: number } = {},
): Promise<string> {
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const response = await fetchFn(SIPSA_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
    body: buildWeeklyRequest(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status !== 200) {
    throw new SipsaError(`service answered HTTP ${response.status}`);
  }

  const bytes = await response.arrayBuffer();

  if (bytes.byteLength > maxBytes) {
    throw new SipsaError("answer too large");
  }

  return new TextDecoder("utf-8").decode(bytes);
}

const rowSchema = z.object({
  artiId: z.string().regex(/^\d{1,6}$/).transform(Number),
  name: z.string().min(1).max(120),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T/)
    .transform((value) => value.slice(0, 10))
    .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`))),
  pricePerKg: z
    .string()
    .regex(/^\d{1,9}(\.\d{1,6})?$/)
    .transform(Number)
    .refine((value) => value > 0),
});

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, body: string) => {
    if (body.startsWith("#x")) return String.fromCodePoint(parseInt(body.slice(2), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? whole;
  });
}

const field = (block: string, tag: string): string | undefined =>
  new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(block)?.[1];

/**
 * Rows of the weekly answer that belong to SIPSA_MARKET. Structural problems
 * (not XML, a SOAP fault, a DOCTYPE, unbalanced rows, wrong operation) throw
 * SipsaError and nothing is returned; bad rows of our market are counted in
 * `invalid` and dropped.
 */
export function parseWeeklyResponse(xml: string): { rows: SipsaRow[]; invalid: number } {
  if (typeof xml !== "string" || !/<(\w+:)?Envelope[\s>]/.test(xml) || !/<\/(\w+:)?Envelope>\s*$/.test(xml)) {
    throw new SipsaError("answer is not a complete SOAP envelope");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new SipsaError("answer contains a DOCTYPE, refused");
  if (/<(\w+:)?Fault[\s>]/.test(xml)) throw new SipsaError("service answered with a SOAP fault");
  if (!/<(\w+:)?promediosSipsaSemanaMadrResponse[\s>/]/.test(xml)) {
    throw new SipsaError("answer is not a promediosSipsaSemanaMadr response");
  }

  const marketTag = `<fuenNombre>${SIPSA_MARKET}</fuenNombre>`;
  const rows: SipsaRow[] = [];
  let invalid = 0;
  let opens = 0;
  let blocks = 0;

  for (let at = xml.indexOf("<return>"); at !== -1; at = xml.indexOf("<return>", at + 8)) opens += 1;

  for (const match of xml.matchAll(/<return>([\s\S]*?)<\/return>/g)) {
    blocks += 1;
    const block = match[1];

    if (block.includes("<return>")) throw new SipsaError("unbalanced rows");
    if (!block.includes(marketTag)) continue;

    const parsed = rowSchema.safeParse({
      artiId: field(block, "artiId"),
      name: decode(field(block, "artiNombre") ?? ""),
      weekStart: field(block, "fechaIni"),
      pricePerKg: field(block, "promedioKg"),
    });

    if (parsed.success) rows.push(parsed.data);
    else invalid += 1;
  }

  if (opens !== blocks || xml.split("</return>").length - 1 !== blocks) throw new SipsaError("unbalanced rows");

  return { rows, invalid };
}
