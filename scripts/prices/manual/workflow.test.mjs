import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { root } from "./testData.mjs";

// Safety properties of .github/workflows/prices-manual.yml (read as text: no YAML dependency).

const yml = readFileSync(path.join(root, ".github/workflows/prices-manual.yml"), "utf8").replace(/\r\n/g, "\n");

test("the manual price workflow only runs when started by hand", () => {
  assert.match(yml, /^on:\n {2}workflow_dispatch:\n/m);
  assert.doesNotMatch(yml, /^\s+(schedule|push|pull_request|pull_request_target):/m);
});

test("it is a dry run unless the person turns it off", () => {
  assert.match(yml, /dry_run:\n(?: {8}.*\n)*? {8}default: true\n/);
});

test("it uses the protected prices environment with read-only repository access", () => {
  assert.match(yml, /^ {4}environment: prices$/m);
  assert.match(yml, /^permissions:\n {2}contents: read$/m);
});

test("every action is pinned to a full commit SHA", () => {
  const uses = [...yml.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  assert.ok(uses.length >= 2);
  for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, u);
});

test("it imports the committed files, skipping the stale ones", () => {
  assert.match(yml, /scripts\/prices\/manual\/import\.ts/);
  assert.match(yml, /--skip-stale/);
  assert.match(yml, /data\/manual-prices\/\*\.json/);
});

test("both price workflows only run on the main branch (secrets never reach other branches)", () => {
  const weekly = readFileSync(path.join(root, ".github/workflows/prices-weekly.yml"), "utf8").replace(/\r\n/g, "\n");
  for (const text of [yml, weekly]) {
    assert.match(text, /^ {4}if: github\.ref == 'refs\/heads\/main'\n {4}runs-on:/m);
    assert.match(text, /^ {4}environment: prices$/m);
  }
});

test("the manual workflow never accepts unconfirmed packs, pack changes or price outliers", () => {
  assert.doesNotMatch(yml, /--allow-/);
});
