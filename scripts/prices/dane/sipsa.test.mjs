import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { SIPSA_ENDPOINT, SIPSA_MARKET, buildWeeklyRequest, fetchWeekly, parseWeeklyResponse } from "./sipsa.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, "fixtures", "semana-bucaramanga.xml"), "utf8");
const wrap = (rows) =>
  `<?xml version='1.0'?><S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body><ns2:promediosSipsaSemanaMadrResponse xmlns:ns2="http://servicios.sipsa.co.gov.dane/">${rows}</ns2:promediosSipsaSemanaMadrResponse></S:Body></S:Envelope>`;
const row = (over = {}) => {
  const r = { artiId: "54", artiNombre: "Zanahoria", fechaIni: "2026-10-24T00:00:00-05:00", fuenNombre: SIPSA_MARKET, promedioKg: "1210", ...over };
  return `<return>${Object.entries(r).map(([k, v]) => (v === null ? "" : `<${k}>${v}</${k}>`)).join("")}</return>`;
};

test("the fixture parses to Bucaramanga Centroabastos rows only", () => {
  const { rows, invalid } = parseWeeklyResponse(fixture);
  assert.equal(invalid, 0);
  assert.ok(rows.length > 100);
  const zanahoria = rows.filter((r) => r.artiId === 54).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  assert.deepEqual(zanahoria.at(-1), { artiId: 54, name: "Zanahoria", weekStart: "2026-10-24", pricePerKg: 1210 });
  assert.equal(zanahoria.length, 2);
  // The fixture also holds Frigorificos, Mercados del centro and a Medellin row: all dropped.
  assert.ok(rows.every((r) => r.pricePerKg > 0));
});

test("only the exact market is kept, names are decoded", () => {
  const xml = wrap(
    row({ artiNombre: "Fr&iacute;jol &amp; &quot;x&quot;" }).replace("&iacute;", "&#237;") +
      row({ fuenNombre: "Bucaramanga, Frigoríficos" }) +
      row({ fuenNombre: "Medellín, Central Mayorista de Antioquia" }),
  );
  const { rows } = parseWeeklyResponse(xml);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Fríjol & "x"');
});

test("invalid rows of the market are counted and dropped", () => {
  const xml = wrap(
    row() +
      row({ promedioKg: "0" }) +
      row({ promedioKg: "abc" }) +
      row({ promedioKg: null }) +
      row({ artiId: "x" }) +
      row({ fechaIni: "mañana" }) +
      row({ promedioKg: "-5" }),
  );
  const { rows, invalid } = parseWeeklyResponse(xml);
  assert.equal(rows.length, 1);
  assert.equal(invalid, 6);
});

test("malformed answers throw and return nothing", () => {
  const bad = [
    "",
    "not xml at all",
    "<html><body>Bad gateway</body></html>",
    wrap(row()).replace("</S:Envelope>", ""),
    wrap(row()).replace("</return>", ""),
    wrap(row()).replace("<return>", "<return><return>"),
    '<?xml version="1.0"?><S:Envelope xmlns:S="http://www.w3.org/2003/05/soap-envelope"><S:Body><S:Fault><S:Reason><S:Text>boom</S:Text></S:Reason></S:Fault></S:Body></S:Envelope>',
    '<!DOCTYPE x [<!ENTITY a "b">]>' + wrap(row()),
    wrap("").replaceAll("promediosSipsaSemanaMadrResponse", "otraOperacionResponse"),
  ];
  for (const xml of bad) assert.throws(() => parseWeeklyResponse(xml), /SIPSA/, xml.slice(0, 60));
});

test("an empty list for a valid envelope is a valid empty result", () => {
  assert.deepEqual(parseWeeklyResponse(wrap("")), { rows: [], invalid: 0 });
});

test("the request is a SOAP 1.2 call to promediosSipsaSemanaMadr with no secrets", () => {
  const xml = buildWeeklyRequest();
  assert.match(xml, /http:\/\/www\.w3\.org\/2003\/05\/soap-envelope/);
  assert.match(xml, /<ser:promediosSipsaSemanaMadr\/>/);
  assert.equal(SIPSA_ENDPOINT, "https://appweb.dane.gov.co/sipsaWS/SrvSipsaUpraBeanService");
});

test("fetchWeekly makes exactly one https POST and returns the text", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(fixture, { status: 200 });
  };
  assert.equal(await fetchWeekly(fakeFetch), fixture);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SIPSA_ENDPOINT);
  assert.equal(calls[0].init.method, "POST");
  assert.match(calls[0].init.headers["Content-Type"], /application\/soap\+xml/);
  assert.ok(calls[0].init.signal);
});

test("fetchWeekly rejects non-200 answers and oversized bodies", async () => {
  await assert.rejects(fetchWeekly(async () => new Response("no", { status: 500 })), /SIPSA.*500/);
  await assert.rejects(
    fetchWeekly(async () => new Response("x".repeat(20), { status: 200 }), { maxBytes: 10 }),
    /SIPSA.*too large/,
  );
});
