// FitMarket is a single-page app: wouter reads real browser paths such as
// /login, /forgot-password and /reset-password. Vercel only has index.html
// on disk, so without a rewrite a direct visit or reload on one of those
// paths (for example the password-reset link from the email) gets Vercel's
// own "404: NOT_FOUND". This test guards the vercel.json that fixes it.
//
// Why a catch-all `/(.*)` does not break /assets/*: Vercel checks the
// filesystem (the built files in dist/) BEFORE applying rewrites. A request
// for /assets/index-abc123.js finds that file and is served as-is; only paths
// with no matching file fall through to the rewrite and get index.html.
// See https://vercel.com/docs/project-configuration#rewrites
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "vercel.json");

assert.ok(existsSync(configPath), "vercel.json must exist at the repo root");

const config = JSON.parse(readFileSync(configPath, "utf8"));
const rewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

const catchAll = rewrites.find(
  (r) => r && r.source === "/(.*)" && r.destination === "/index.html",
);
assert.ok(
  catchAll,
  'vercel.json needs the rewrite { "source": "/(.*)", "destination": "/index.html" }',
);

// The catch-all must be a plain rewrite. "routes" (legacy) or a "has"/
// "missing" condition would change precedence and could shadow real files.
assert.equal(config.routes, undefined, "do not use legacy `routes`; it skips the filesystem-first check");
assert.equal(catchAll.has, undefined);
assert.equal(catchAll.missing, undefined);

// Rewrites never apply to existing files, but a rewrite placed before the
// catch-all that points /assets/* elsewhere would. Keep assets untouched.
for (const r of rewrites) {
  assert.ok(!String(r.source).startsWith("/assets"), `unexpected rewrite for assets: ${r.source}`);
}

// Sanity check of the routes this protects: the regex Vercel builds from
// "/(.*)" must match every client-side route the app uses.
const pattern = new RegExp(`^${catchAll.source}$`);
for (const route of ["/", "/login", "/forgot-password", "/reset-password"]) {
  assert.ok(pattern.test(route), `catch-all must cover ${route}`);
}
