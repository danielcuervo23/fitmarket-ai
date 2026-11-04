import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INSTALL_PAGE, buildBookmarkletUrl } from "./build.ts";

// Builds the bookmarklet from the sources (no network) and checks the committed install page.

const href = (page) => /class="bookmarklet" href="([^"]+)"/.exec(page)?.[1]?.replace(/&amp;/g, "&");
const built = await buildBookmarkletUrl();
const code = decodeURIComponent(built.slice("javascript:".length));

test("tools/anotador/index.html carries the bookmarklet built from the current sources (run npm run anotador:build)", () => {
  assert.equal(href(readFileSync(INSTALL_PAGE, "utf8")), built);
});

test("the bookmarklet never talks to the network or to Supabase", () => {
  for (const banned of ["fetch(", "XMLHttpRequest", "sendBeacon", "WebSocket", "EventSource", "supabase", "import(", "eval(", "innerHTML", "insertAdjacentHTML", "document.write"]) {
    assert.ok(!code.includes(banned), `bundle contains ${banned}`);
  }
});

test("the bookmarklet only carries the four allowed stores and the 70 foods' names", () => {
  for (const host of ["www.exito.com", "www.carulla.com", "www.jumbocolombia.com", "www.d1.com.co"]) assert.ok(code.includes(host), host);
  assert.ok(!code.includes("aratiendas.com"));
  assert.ok(code.includes("Pechuga de pollo"));
  assert.ok(!code.includes("nutritionRef"), "only id, name, unit and usual pack of each food");
});
