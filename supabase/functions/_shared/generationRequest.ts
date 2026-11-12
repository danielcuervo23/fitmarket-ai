/**
 * The body of a generate-weekly-plan request. Pure and tolerant on purpose:
 * the web deployed before Plan 2 sends `{}` (or nothing), so any body that is
 * too big, not JSON or not an object falls back to the defaults, and unknown
 * fields are ignored. Only two typed fields are ever read; nothing from the
 * raw body is echoed back or logged.
 */
export interface GenerationRequestBody {
  /** The app's version ("MAJOR.MINOR.PATCH"), or null when absent or invalid. */
  appVersion: string | null;
  /** "Quiero el plan igual": true only when the client sent exactly `true`. */
  allowPartial: boolean;
}

/** Hard cap on the body size. Also applied to bytes while reading the stream. */
export const MAX_BODY_CHARS = 2048;

/** First app version that understands the `goals_unreachable` answer. */
export const MIN_VERSION_GOALS_UNREACHABLE = "0.1.0";

/** Longest time spent reading the body before falling back to the defaults. */
export const BODY_READ_DEADLINE_MS = 3000;

// Each part 0-999 without leading zeros ("01.2.3" is not a version).
const VERSION_PATTERN = /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

const defaults = (): GenerationRequestBody => ({
  appVersion: null,
  allowPartial: false,
});

export function parseGenerationRequestBody(text: string): GenerationRequestBody {
  if (text.length === 0 || text.length > MAX_BODY_CHARS) {
    return defaults();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return defaults();
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return defaults();
  }

  const record = raw as Record<string, unknown>;
  const version = Object.hasOwn(record, "appVersion") ? record.appVersion : undefined;
  const partial = Object.hasOwn(record, "allowPartial") ? record.allowPartial : undefined;

  return {
    appVersion:
      typeof version === "string" && VERSION_PATTERN.test(version) ? version : null,
    allowPartial: partial === true,
  };
}

function versionParts(version: string): number[] | null {
  return VERSION_PATTERN.test(version) ? version.split(".").map(Number) : null;
}

/** Numeric MAJOR.MINOR.PATCH comparison; no version means an old client. */
export function supportsGoalsUnreachable(appVersion: string | null): boolean {
  const client = appVersion === null ? null : versionParts(appVersion);
  const minimum = versionParts(MIN_VERSION_GOALS_UNREACHABLE) as number[];

  if (!client) {
    return false;
  }

  for (let i = 0; i < minimum.length; i += 1) {
    if (client[i] !== minimum[i]) {
      return client[i] > minimum[i];
    }
  }
  return true;
}

/**
 * Reads the request body without ever buffering more than the cap: a declared
 * length over the cap is not read at all, and a streamed body without a length
 * is cut as soon as it passes the cap. A body still arriving after the
 * deadline (a slow drip that would hold the isolate) is cancelled. Any read
 * problem gives the defaults.
 */
export async function readGenerationRequestBody(
  req: Request,
  options: { deadlineMs?: number } = {},
): Promise<GenerationRequestBody> {
  const declared = req.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= MAX_BODY_CHARS)) {
    return defaults();
  }
  if (!req.body) {
    return defaults();
  }

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), options.deadlineMs ?? BODY_READ_DEADLINE_MS);
  });
  const stop = () => {
    reader.cancel().catch(() => undefined);
    return defaults();
  };

  try {
    for (;;) {
      const next = await Promise.race([reader.read(), timedOut]);
      if (next === "timeout") return stop();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_BODY_CHARS) return stop();
      chunks.push(next.value);
    }
  } catch {
    return stop();
  } finally {
    clearTimeout(timer);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return parseGenerationRequestBody(new TextDecoder().decode(bytes));
}
