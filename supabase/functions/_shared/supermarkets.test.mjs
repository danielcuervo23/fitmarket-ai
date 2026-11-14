import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SUPERMARKETS,
  isStoreSelectable,
  isSupermarketId,
  plannableStores,
} from "./supermarkets.ts";

test("every chain is listed once, in the order the app shows them", () => {
  assert.deepEqual(
    SUPERMARKETS.map((store) => store.id),
    ["D1", "Ara", "Exito", "Jumbo", "Carulla"],
  );
});

test("Ara is coming soon and the other chains are available", () => {
  const status = Object.fromEntries(SUPERMARKETS.map((store) => [store.id, store.status]));

  assert.deepEqual(status, {
    D1: "available",
    Ara: "coming_soon",
    Exito: "available",
    Jumbo: "available",
    Carulla: "available",
  });
});

test("a coming-soon chain is a known id but cannot be selected", () => {
  assert.equal(isSupermarketId("Ara"), true);
  assert.equal(isStoreSelectable("Ara"), false);
  assert.equal(isStoreSelectable("D1"), true);
  assert.equal(isStoreSelectable("Olimpica"), false);
});

test("plannableStores drops coming-soon and unknown chains, keeping order", () => {
  assert.deepEqual(plannableStores(["Jumbo", "Ara", "x", "D1"]), ["Jumbo", "D1"]);
  assert.deepEqual(plannableStores(["Ara"]), []);
});
