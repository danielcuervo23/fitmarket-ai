import assert from "node:assert/strict";
import { logUnexpected } from "./log.ts";

function captureLogs(run) {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines.map((line) => JSON.parse(line));
}

// An unexpected crash is logged with the function and the error type...
{
  const [entry] = captureLogs(() =>
    logUnexpected("generate-weekly-plan", new TypeError("weight 82 kg for ana@mail.com")),
  );
  assert.deepEqual(entry, {
    event: "unexpected_error",
    fn: "generate-weekly-plan",
    name: "TypeError",
  });
  // ...but never the message, which can carry personal or health data.
  assert.doesNotMatch(JSON.stringify(entry), /ana@mail|82 kg/);
}

// Things thrown that are not Error objects are still logged, without content.
{
  const [entry] = captureLogs(() => logUnexpected("delete-account", "secret string"));
  assert.deepEqual(entry, { event: "unexpected_error", fn: "delete-account", name: "unknown" });
}

// Any code can set `error.name`; only a plain class-like name is kept.
{
  const odd = new Error("x");
  odd.name = "Failed for ana@mail.com";
  const [entry] = captureLogs(() => logUnexpected("delete-account", odd));
  assert.equal(entry.name, "unknown");

  const long = new Error("x");
  long.name = "A".repeat(200);
  const [entryLong] = captureLogs(() => logUnexpected("delete-account", long));
  assert.equal(entryLong.name, "unknown");
}

console.log("log: all checks passed");
