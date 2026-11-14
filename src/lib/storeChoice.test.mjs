import assert from "node:assert/strict";
import { test } from "node:test";
import { editableStores, prepareStoresToSave, storeOptions, toggleStore } from "./storeChoice.ts";

test("storeOptions lists every chain and marks Ara as coming soon", () => {
  const options = storeOptions();

  assert.deepEqual(options.map((option) => option.id), ["D1", "Ara", "Exito", "Jumbo", "Carulla"]);
  assert.deepEqual(
    options.filter((option) => !option.selectable).map((option) => option.id),
    ["Ara"],
  );
  assert.equal(options.find((option) => option.id === "Exito").name, "Éxito");
});

test("toggleStore adds and removes available chains", () => {
  assert.deepEqual(toggleStore(["D1"], "Jumbo"), ["D1", "Jumbo"]);
  assert.deepEqual(toggleStore(["D1", "Jumbo"], "D1"), ["Jumbo"]);
});

test("toggleStore never selects a coming-soon chain", () => {
  const value = ["D1"];

  assert.equal(toggleStore(value, "Ara"), value);
});

test("editableStores drops a saved Ara and unknown ids", () => {
  assert.deepEqual(editableStores(["Ara", "D1", "Olimpica"]), ["D1"]);
  assert.deepEqual(editableStores(["Ara"]), []);
});

test("prepareStoresToSave rejects unknown ids and an empty choice", () => {
  assert.deepEqual(prepareStoresToSave(["D1", "D1", "Jumbo"]), { stores: ["D1", "Jumbo"], error: null });
  assert.deepEqual(prepareStoresToSave(["D1", "hack"]), { stores: [], error: "errors.invalidValues" });
  assert.deepEqual(prepareStoresToSave([]), { stores: [], error: "errors.storesRequired" });
});

test("prepareStoresToSave never saves Ara, and Ara alone counts as empty", () => {
  assert.deepEqual(prepareStoresToSave(["Ara", "D1"]), { stores: ["D1"], error: null });
  assert.deepEqual(prepareStoresToSave(["Ara"]), { stores: [], error: "errors.storesRequired" });
});
