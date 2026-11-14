// The body the web sends to generate-weekly-plan (Plan 2, Task 15). It is
// checked against the server's own parser so both sides keep one contract.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MAX_BODY_CHARS,
  parseGenerationRequestBody,
  supportsGoalsUnreachable,
} from "../../supabase/functions/_shared/generationRequest.ts";
import { buildGenerationRequestBody } from "./ai/generationRequestBody.ts";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

test("package.json version is one the server understands and accepts for goals_unreachable", () => {
  assert.equal(pkg.version, "0.1.0");
  assert.equal(parseGenerationRequestBody(JSON.stringify({ appVersion: pkg.version })).appVersion, pkg.version);
  assert.ok(supportsGoalsUnreachable(pkg.version));
});

test("a normal request sends only the app version", () => {
  const body = buildGenerationRequestBody(pkg.version);
  assert.deepEqual(body, { appVersion: pkg.version });
  assert.deepEqual(parseGenerationRequestBody(JSON.stringify(body)), {
    appVersion: pkg.version,
    allowPartial: false,
  });
});

test("'Quiero el plan igual' adds allowPartial: true and the server reads it", () => {
  const body = buildGenerationRequestBody(pkg.version, { allowPartial: true });
  assert.deepEqual(body, { appVersion: pkg.version, allowPartial: true });
  assert.deepEqual(parseGenerationRequestBody(JSON.stringify(body)), {
    appVersion: pkg.version,
    allowPartial: true,
  });
});

test("allowPartial false is not sent at all", () => {
  assert.deepEqual(buildGenerationRequestBody(pkg.version, { allowPartial: false }), {
    appVersion: pkg.version,
  });
});

test("a malformed version is never sent", () => {
  for (const bad of ["", "0.1", "0.1.0-beta", "01.2.3", "1.2.3.4", "v1.2.3"]) {
    assert.deepEqual(buildGenerationRequestBody(bad), {}, bad);
  }
});

test("the body stays far below the server's size cap", () => {
  const text = JSON.stringify(buildGenerationRequestBody("999.999.999", { allowPartial: true }));
  assert.ok(text.length < MAX_BODY_CHARS);
});

test("the version comes from package.json through Vite (one source of truth)", () => {
  const vite = readFileSync(new URL("../../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /__APP_VERSION__:\s*JSON\.stringify\(pkg\.version\)/);
});
