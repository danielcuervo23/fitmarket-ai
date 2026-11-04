import assert from "node:assert/strict";
import { MAX_TIME_BUDGET_MS } from "./planner/callBudget.ts";
import {
  PLAN_SAVE_TIMEOUT_MS,
  respondWithGeneratedPlan,
  savePlanForUser,
} from "./planStorage.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const plan = { days: [], shoppingList: [] };

/**
 * A fake Supabase client that records the insert and answers with `result`.
 * `result === "hang"` never answers until the abort signal fires, then
 * answers like supabase-js does for an aborted fetch.
 */
function fakeClient(result) {
  const calls = [];
  const client = {
    from(table) {
      const call = { table };
      calls.push(call);
      return {
        insert(row) {
          call.row = row;
          return {
            select(columns) {
              call.columns = columns;
              return {
                abortSignal(signal) {
                  call.signal = signal;
                  return {
                    single: async () => {
                      if (result instanceof Error) throw result;
                      if (result === "hang") {
                        await new Promise((resolve) =>
                          signal.addEventListener("abort", resolve),
                        );
                        return {
                          data: null,
                          error: { code: "", message: "AbortError: aborted" },
                        };
                      }
                      return result;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

/** Runs `fn` and returns what it printed with console.log, parsed as JSON. */
async function captureLogs(fn) {
  const original = console.log;
  const lines = [];
  console.log = (line) => lines.push(line);
  try {
    const value = await fn();
    return { value, logs: lines.map((line) => JSON.parse(line)) };
  } finally {
    console.log = original;
  }
}

// Saved: the plan goes to weekly_plans under the verified user id.
{
  const { client, calls } = fakeClient({ data: { id: PLAN_ID }, error: null });
  const { value, logs } = await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.equal(value, PLAN_ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "weekly_plans");
  assert.deepEqual(calls[0].row, { user_id: USER, plan_json: plan });
  assert.equal(calls[0].columns, "id");
  assert.deepEqual(logs, []);
}

// No service key: nothing is saved, the client will save instead.
{
  const { value, logs } = await captureLogs(() => savePlanForUser(null, USER, plan));
  assert.equal(value, null);
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "no_service_key" }]);
}

// Insert error: logged by code only, never fails the request.
{
  const { client } = fakeClient({
    data: null,
    error: { code: "23503", message: `user ${USER} not found` },
  });
  const { value, logs } = await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.equal(value, null);
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "23503" }]);
  assert.ok(!JSON.stringify(logs).includes(USER), "no user id in logs");
}

// Insert error without a code.
{
  const { client } = fakeClient({ data: null, error: { message: "boom" } });
  const { logs } = await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "insert_failed" }]);
}

// A row without an id is not a usable save.
{
  const { client } = fakeClient({ data: {}, error: null });
  const { value, logs } = await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.equal(value, null);
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "no_id" }]);
}

// The client throws (network): swallowed, logged without the message.
{
  const { client } = fakeClient(new Error(`fetch failed for ${USER}`));
  const { value, logs } = await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.equal(value, null);
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "exception" }]);
}

// Every insert carries an abort signal, so a slow database cannot hold the
// function until the platform kills it.
{
  const { client, calls } = fakeClient({ data: { id: PLAN_ID }, error: null });
  await captureLogs(() => savePlanForUser(client, USER, plan));
  assert.ok(calls[0].signal instanceof AbortSignal, "insert has a time limit");
}

// A database that never answers: give up after the limit, no planId.
{
  const { client } = fakeClient("hang");
  const started = Date.now();
  // AbortSignal.timeout does not keep Node alive on its own (in the function
  // the open request does), so hold the process while we wait.
  const keepAlive = setTimeout(() => {}, 2_000);
  const { value, logs } = await captureLogs(() =>
    savePlanForUser(client, USER, plan, 50),
  );
  clearTimeout(keepAlive);
  assert.equal(value, null);
  assert.ok(Date.now() - started < 2_000, "did not wait for the database");
  assert.deepEqual(logs, [{ event: "plan_save_failed", code: "timeout" }]);
}

// The save fits in the margin the generation budget leaves before the 150 s
// Edge Function limit, even when generation used all of its budget.
assert.ok(PLAN_SAVE_TIMEOUT_MS > 0);
assert.ok(PLAN_SAVE_TIMEOUT_MS <= 5_000);
assert.ok(MAX_TIME_BUDGET_MS + PLAN_SAVE_TIMEOUT_MS < 150_000);

// --- respondWithGeneratedPlan: validate with the shared schema, then save.

const parsedPlan = { ...plan, normalized: true };
const accept = (raw) => ({ data: { ...raw, normalized: true }, error: null });
const reject = () => ({ data: null, error: "invalid" });

// A plan the schema rejects is never saved and answers invalid_format (422),
// like the browser did when it validated before saving.
{
  const { client, calls } = fakeClient({ data: { id: PLAN_ID }, error: null });
  const { value, logs } = await captureLogs(() =>
    respondWithGeneratedPlan(plan, { parse: reject, client, userId: USER }),
  );
  assert.equal(calls.length, 0, "an invalid plan is not inserted");
  assert.equal(value.status, 422);
  assert.equal(value.body.code, "invalid_format");
  assert.equal(typeof value.body.error, "string");
  assert.ok(!("plan" in value.body), "an invalid plan is not returned");
  assert.deepEqual(logs, [{ event: "plan_schema_rejected", code: "invalid_format" }]);
}

// A valid plan is saved and returned as parsed by the schema, with its id.
{
  const { client, calls } = fakeClient({ data: { id: PLAN_ID }, error: null });
  const { value } = await captureLogs(() =>
    respondWithGeneratedPlan(plan, { parse: accept, client, userId: USER }),
  );
  assert.deepEqual(calls[0].row, { user_id: USER, plan_json: parsedPlan });
  assert.deepEqual(value, { status: 200, body: { plan: parsedPlan, planId: PLAN_ID } });
}

// A valid plan whose save fails still reaches the user, without planId.
{
  const { value } = await captureLogs(() =>
    respondWithGeneratedPlan(plan, { parse: accept, client: null, userId: USER }),
  );
  assert.deepEqual(value, { status: 200, body: { plan: parsedPlan } });
}

console.log("planStorage: all checks passed");
