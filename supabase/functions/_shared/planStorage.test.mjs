import assert from "node:assert/strict";
import { savePlanForUser } from "./planStorage.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const plan = { days: [], shoppingList: [] };

/** A fake Supabase client that records the insert and answers with `result`. */
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
                single: async () => {
                  if (result instanceof Error) throw result;
                  return result;
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

console.log("planStorage: all checks passed");
