import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_BODY_CHARS,
  MIN_VERSION_GOALS_UNREACHABLE,
  parseGenerationRequestBody,
  readGenerationRequestBody,
  supportsGoalsUnreachable,
} from "./generationRequest.ts";

const DEFAULTS = { appVersion: null, allowPartial: false };

test("constants match the plan", () => {
  assert.equal(MAX_BODY_CHARS, 2048);
  assert.equal(MIN_VERSION_GOALS_UNREACHABLE, "0.1.0");
});

test("empty body ({} from the old web) gives no version and no partial", () => {
  assert.deepEqual(parseGenerationRequestBody("{}"), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody(""), DEFAULTS);
});

test("a valid body from the new web is read", () => {
  assert.deepEqual(
    parseGenerationRequestBody('{"appVersion":"0.1.0","allowPartial":true}'),
    { appVersion: "0.1.0", allowPartial: true },
  );
});

test("oversized, non-JSON or array bodies give defaults", () => {
  const big = JSON.stringify({ appVersion: "1.0.0", pad: "x".repeat(MAX_BODY_CHARS) });
  assert.deepEqual(parseGenerationRequestBody(big), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody("not json"), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody('["1.0.0", true]'), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody("null"), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody('"1.0.0"'), DEFAULTS);
  assert.deepEqual(parseGenerationRequestBody("42"), DEFAULTS);
});

test("a body of exactly the cap is still read", () => {
  const base = '{"appVersion":"1.0.0","pad":""}';
  const exact = base.replace('""', `"${"x".repeat(MAX_BODY_CHARS - base.length)}"`);
  assert.equal(exact.length, MAX_BODY_CHARS);
  assert.equal(parseGenerationRequestBody(exact).appVersion, "1.0.0");
});

test("appVersion with letters or 4 parts is ignored", () => {
  for (const appVersion of ["1.2.3-beta", "v1.2.3", "1.2.3.4", "1.2", "1234.0.0", " 1.2.3", "1.2.3\n", 123, null, {}]) {
    assert.equal(
      parseGenerationRequestBody(JSON.stringify({ appVersion })).appVersion,
      null,
      JSON.stringify(appVersion),
    );
  }
});

test("allowPartial: 'true' (string) is not accepted", () => {
  for (const allowPartial of ["true", 1, "yes", null, {}]) {
    assert.equal(
      parseGenerationRequestBody(JSON.stringify({ appVersion: "0.1.0", allowPartial })).allowPartial,
      false,
      JSON.stringify(allowPartial),
    );
  }
});

test("unknown fields are ignored and never copied to the result", () => {
  const parsed = parseGenerationRequestBody(
    '{"appVersion":"0.2.0","userId":"someone-else","weeklyBudgetCop":1,"__proto__":{"allowPartial":true}}',
  );
  assert.deepEqual(parsed, { appVersion: "0.2.0", allowPartial: false });
  assert.deepEqual(Object.keys(parsed).sort(), ["allowPartial", "appVersion"]);
});

test("0.1.0 and 1.2.3 support goals_unreachable; 0.0.9 and null do not", () => {
  assert.equal(supportsGoalsUnreachable("0.1.0"), true);
  assert.equal(supportsGoalsUnreachable("1.2.3"), true);
  assert.equal(supportsGoalsUnreachable("0.10.0"), true, "numeric, not text, comparison");
  assert.equal(supportsGoalsUnreachable("0.0.9"), false);
  assert.equal(supportsGoalsUnreachable("0.0.1"), false);
  assert.equal(supportsGoalsUnreachable(null), false);
  assert.equal(supportsGoalsUnreachable("garbage"), false);
});

const post = (body, headers = {}) =>
  new Request("https://example.test/fn", { method: "POST", body, headers });

test("readGenerationRequestBody reads a small body", async () => {
  assert.deepEqual(
    await readGenerationRequestBody(post('{"appVersion":"0.1.0","allowPartial":true}')),
    { appVersion: "0.1.0", allowPartial: true },
  );
});

test("readGenerationRequestBody: no body gives defaults", async () => {
  assert.deepEqual(
    await readGenerationRequestBody(new Request("https://example.test/fn", { method: "POST" })),
    DEFAULTS,
  );
});

test("readGenerationRequestBody: a declared length over the cap is not read", async () => {
  const req = post('{"appVersion":"0.1.0"}', { "content-length": String(MAX_BODY_CHARS + 1) });
  assert.deepEqual(await readGenerationRequestBody(req), DEFAULTS);
  assert.equal(req.bodyUsed, false, "body must not be read");
});

test("readGenerationRequestBody: a streamed body without length stops at the cap", async () => {
  let chunks = 0;
  const piece = new TextEncoder().encode("x".repeat(512));
  const stream = new ReadableStream({
    pull(controller) {
      chunks += 1;
      if (chunks > 100) controller.close();
      else controller.enqueue(piece);
    },
  });
  const req = new Request("https://example.test/fn", { method: "POST", body: stream, duplex: "half" });
  assert.deepEqual(await readGenerationRequestBody(req), DEFAULTS);
  assert.ok(chunks < 10, `read ${chunks} chunks, expected to stop early`);
});
