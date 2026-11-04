import assert from "node:assert/strict";
import { profileUpdateError } from "./profileUpdate.ts";

// The bug: an update that matches no row (the user has no profile yet) comes
// back from Supabase with no error, so the app said "saved" and moved on.
assert.equal(
  profileUpdateError({ data: [], error: null }),
  "errors.profileFirst",
  "an update that touched no row did not save anything",
);
assert.equal(
  profileUpdateError({ data: null, error: null }),
  "errors.profileFirst",
  "no rows returned at all",
);

// One row updated: saved.
assert.equal(profileUpdateError({ data: [{ id: "u1" }], error: null }), null);

// Database errors keep their existing translation.
assert.equal(
  profileUpdateError({ data: null, error: { message: "new row violates row-level security", code: "42501" } }),
  "errors.permission",
);
assert.equal(
  profileUpdateError({ data: null, error: { message: "JSON object requested, 0 rows", code: "PGRST116" } }),
  "errors.profileFirst",
);

console.log("profileUpdate: all checks passed");
