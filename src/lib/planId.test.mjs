import assert from "node:assert/strict";
import { readPlanId } from "./planId.ts";

const ID = "22222222-2222-4222-8222-222222222222";

// The server saved the plan and sent its id.
assert.equal(readPlanId({ plan: {}, planId: ID }), ID);
assert.equal(readPlanId({ planId: ID.toUpperCase() }), ID.toUpperCase());

// Older server (no planId) or a failed server save: the client must save.
assert.equal(readPlanId({ plan: {} }), null);
assert.equal(readPlanId({ plan: {}, planId: null }), null);
assert.equal(readPlanId(null), null);
assert.equal(readPlanId(undefined), null);
assert.equal(readPlanId("not an object"), null);

// Anything that is not a UUID string is treated as "not saved".
for (const bad of [42, "", "abc", `${ID} `, `{${ID}}`, `${ID}0`, ["x"], { id: ID }, true]) {
  assert.equal(readPlanId({ planId: bad }), null, JSON.stringify(bad));
}

console.log("planId: all checks passed");
