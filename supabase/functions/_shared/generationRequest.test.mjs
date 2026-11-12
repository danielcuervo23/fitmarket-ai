import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BODY_READ_DEADLINE_MS,
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

test("appVersion with leading zeros is ignored", () => {
  for (const appVersion of ["01.2.3", "1.02.3", "1.2.03", "00.1.0"]) {
    assert.equal(parseGenerationRequestBody(JSON.stringify({ appVersion })).appVersion, null, appVersion);
  }
  for (const appVersion of ["0.0.0", "0.1.0", "100.20.3", "999.999.999"]) {
    assert.equal(parseGenerationRequestBody(JSON.stringify({ appVersion })).appVersion, appVersion, appVersion);
  }
});

test("readGenerationRequestBody: multibyte body over the cap in bytes (not in chars) gives defaults", async () => {
  const text = JSON.stringify({ appVersion: "0.1.0", pad: "ñ".repeat(1100) });
  assert.ok(text.length <= MAX_BODY_CHARS);
  assert.ok(new TextEncoder().encode(text).byteLength > MAX_BODY_CHARS);
  assert.deepEqual(await readGenerationRequestBody(post(text)), DEFAULTS);
});

test("readGenerationRequestBody: a non-numeric content-length gives defaults", async () => {
  const req = post('{"appVersion":"0.1.0"}', { "content-length": "abc" });
  assert.deepEqual(await readGenerationRequestBody(req), DEFAULTS);
});

test("readGenerationRequestBody: a single chunk larger than the cap gives defaults", async () => {
  const big = new TextEncoder().encode(JSON.stringify({ appVersion: "0.1.0", pad: "x".repeat(4000) }));
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(big);
      controller.close();
    },
  });
  const req = new Request("https://example.test/fn", { method: "POST", body: stream, duplex: "half" });
  assert.deepEqual(await readGenerationRequestBody(req), DEFAULTS);
});

test("readGenerationRequestBody: a stream that errors mid-read gives defaults", async () => {
  let sent = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (!sent) {
        sent = true;
        controller.enqueue(new TextEncoder().encode('{"appVersion":'));
      } else {
        controller.error(new Error("connection reset"));
      }
    },
  });
  const req = new Request("https://example.test/fn", { method: "POST", body: stream, duplex: "half" });
  assert.deepEqual(await readGenerationRequestBody(req), DEFAULTS);
});

test("the default read deadline is about 3 seconds", () => {
  assert.equal(BODY_READ_DEADLINE_MS, 3000);
});

test("readGenerationRequestBody: a slow-drip stream that never closes gives defaults by the deadline", { timeout: 2000 }, async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"appVersion":"0.1.0"'));
      // never closes
    },
    cancel() {
      cancelled = true;
    },
  });
  const req = new Request("https://example.test/fn", { method: "POST", body: stream, duplex: "half" });
  const started = Date.now();
  assert.deepEqual(await readGenerationRequestBody(req, { deadlineMs: 50 }), DEFAULTS);
  assert.ok(Date.now() - started < 1000, "returned within the deadline");
  assert.equal(cancelled, true, "the reader was cancelled");
});
