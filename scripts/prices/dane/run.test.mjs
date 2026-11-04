import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadMapping } from "./derive.ts";
import { runDane, createReferenceSinkFromClient } from "./run.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(path.join(here, "fixtures", "semana-bucaramanga.xml"), "utf8");
const foods = JSON.parse(readFileSync(path.join(here, "../../../data/foods/foods.json"), "utf8"));
const mapping = loadMapping(JSON.parse(readFileSync(path.join(here, "mapping.json"), "utf8")), new Set(foods.map((f) => f.id)));
const TODAY = "2026-11-04";

const answer = (body, status = 200) => async () => new Response(body, { status });
const fakeSink = () => {
  const writes = [];
  return { writes, async upsertReferencePrices(rows) { writes.push(...rows); } };
};
const base = (over) => ({ fetch: answer(fixture), foods, mapping, city: "bucaramanga", today: TODAY, sink: fakeSink(), ...over });

test("stores one validated row per food with source dane_sipsa", async () => {
  const sink = fakeSink();
  const summary = await runDane(base({ sink }));
  assert.equal(sink.writes.length, summary.stored);
  assert.ok(summary.stored >= 40);
  for (const row of sink.writes) {
    assert.deepEqual(Object.keys(row).sort(), ["city", "foodId", "observedOn", "pricePerUnit", "source"]);
    assert.equal(row.city, "bucaramanga");
    assert.equal(row.source, "dane_sipsa");
    assert.ok(row.pricePerUnit > 0);
    assert.match(row.observedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.deepEqual(summary.anomalies.map((a) => a.foodId).sort(), ["cebolla_junca", "cilantro"]);
});

test("a dry run reads and checks but writes nothing", async () => {
  const sink = fakeSink();
  const summary = await runDane(base({ sink, dryRun: true }));
  assert.equal(sink.writes.length, 0);
  assert.ok(summary.stored >= 40);
  assert.equal(summary.dryRun, true);
});

test("a malformed answer stores nothing and fails", async () => {
  const sink = fakeSink();
  await assert.rejects(runDane(base({ sink, fetch: answer("<html>oops</html>") })), /SIPSA/);
  await assert.rejects(runDane(base({ sink, fetch: answer("", 503) })), /SIPSA/);
  assert.equal(sink.writes.length, 0);
});

test("an answer with no Bucaramanga rows is an error, not an empty success", async () => {
  const empty = fixture.replace(/<return>.*<\/return>/s, "");
  const sink = fakeSink();
  await assert.rejects(runDane(base({ sink, fetch: answer(empty) })), /no rows/i);
  assert.equal(sink.writes.length, 0);
});

test("bad city or date is refused", async () => {
  await assert.rejects(runDane(base({ city: "Bad City!" })), /city/);
  await assert.rejects(runDane(base({ today: "hoy" })), /today/);
});

test("the sink upserts snake_case rows in chunks on the primary key", async () => {
  const calls = [];
  const client = {
    from(table) {
      return {
        async upsert(rows, options) {
          calls.push({ table, rows, options });
          return { error: null };
        },
      };
    },
  };
  const sink = createReferenceSinkFromClient(client);
  const rows = Array.from({ length: 450 }, (_, i) => ({ city: "bucaramanga", foodId: `f${i}`, pricePerUnit: 1.5, observedOn: TODAY, source: "dane_sipsa" }));
  await sink.upsertReferencePrices(rows);
  assert.deepEqual(calls.map((c) => c.rows.length), [200, 200, 50]);
  assert.equal(calls[0].table, "city_reference_prices");
  assert.deepEqual(calls[0].options, { onConflict: "city,food_id,source" });
  assert.deepEqual(calls[0].rows[0], { city: "bucaramanga", food_id: "f0", price_cop_per_unit: 1.5, observed_on: TODAY, source: "dane_sipsa" });

  const failing = createReferenceSinkFromClient({ from: () => ({ upsert: async () => ({ error: { message: "denied" } }) }) });
  await assert.rejects(failing.upsertReferencePrices(rows.slice(0, 1)), /city_reference_prices.*denied/);
});
