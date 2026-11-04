import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadMappings, parseMappings } from "./mappings.ts";

const foods = new Set(["arroz", "leche"]);
const host = "www.exito.com";
const good = {
  foodId: "arroz",
  externalId: "123",
  name: "Arroz Diana 500 g",
  packSize: 500,
  url: "https://www.exito.com/arroz-diana-500g/p",
};

test("a valid file parses and tags the store", () => {
  const out = parseMappings([good], "Exito", foods, host);
  assert.deepEqual(out, [{ ...good, storeId: "Exito" }]);
});

test("unknown foodId, http url, other domain and packSize 0 each name their entry", () => {
  const cases = [
    [{ ...good, foodId: "nope" }, /entry 1.*foodId/s],
    [{ ...good, url: "http://www.exito.com/a/p" }, /entry 1.*url/s],
    [{ ...good, url: "https://evil.example.com/a/p" }, /entry 1.*url/s],
    [{ ...good, packSize: 0 }, /entry 1.*packSize/s],
  ];
  for (const [bad, re] of cases) {
    assert.throws(() => parseMappings([good, bad], "Exito", foods, host), re);
  }
});

test("every invalid entry is listed, extra fields and duplicate ids are rejected", () => {
  let message = "";
  try {
    parseMappings(
      [
        { ...good, packSize: -1 },
        good,
        { ...good, foodId: "x", externalId: "9" },
        { ...good, extra: 1, externalId: "7" },
        good,
      ],
      "Exito",
      foods,
      host,
    );
  } catch (e) {
    message = String(e.message);
  }
  for (const i of [0, 2, 3, 4]) assert.match(message, new RegExp("entry " + i + "\\b"));
  assert.match(message, /duplicate/i);
});

test("not an array is rejected", () => {
  assert.throws(() => parseMappings({}, "Exito", foods, host), /array/);
});

test("a path pattern, when given, must match the product url", () => {
  assert.throws(
    () => parseMappings([{ ...good, url: "https://www.exito.com/busca?q=a" }], "Exito", foods, host, "/<slug>/p"),
    /entry 0.*url/s,
  );
  assert.equal(parseMappings([good], "Exito", foods, host, "/<slug>/p").length, 1);
});

test("loadMappings reads <StoreId>.json files and skips stores without a file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "maps-"));
  writeFileSync(path.join(dir, "Exito.json"), JSON.stringify([good]));
  const hosts = { Exito: host, D1: "domicilios.tiendasd1.com" };
  const out = loadMappings(dir, foods, hosts, {});
  assert.deepEqual(Object.keys(out), ["Exito"]);
  writeFileSync(path.join(dir, "D1.json"), "{not json");
  assert.throws(() => loadMappings(dir, foods, hosts, {}), /D1\.json/);
});
