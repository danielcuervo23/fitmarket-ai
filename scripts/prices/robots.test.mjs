import assert from "node:assert/strict";
import test from "node:test";
import { isPathAllowed } from "./robots.ts";

const UA = "FitMarketPriceBot/1.0 (+https://fitmarket-ai.vercel.app)";

test("Disallow blocks the prefix but not other paths", () => {
  const txt = "User-agent: *\nDisallow: /checkout\n";
  assert.equal(isPathAllowed(txt, UA, "/checkout/x"), false);
  assert.equal(isPathAllowed(txt, UA, "/p/arroz"), true);
});

test("a group naming FitMarketPriceBot overrides the * group", () => {
  const txt = "User-agent: *\nDisallow: /\n\nUser-agent: FitMarketPriceBot\nDisallow: /checkout\n";
  assert.equal(isPathAllowed(txt, UA, "/p/arroz"), true);
  assert.equal(isPathAllowed(txt, UA, "/checkout/1"), false);
});

test("the longer matching rule wins, Allow wins ties", () => {
  const txt = "User-agent: *\nDisallow: /shop\nAllow: /shop/open\n";
  assert.equal(isPathAllowed(txt, UA, "/shop/open/1"), true);
  assert.equal(isPathAllowed(txt, UA, "/shop/closed"), false);
  const tie = "User-agent: *\nDisallow: /a\nAllow: /a\n";
  assert.equal(isPathAllowed(tie, UA, "/a"), true);
});

test("empty file allows everything and Disallow: / blocks everything", () => {
  assert.equal(isPathAllowed("", UA, "/anything"), true);
  assert.equal(isPathAllowed("User-agent: *\nDisallow: /\n", UA, "/anything"), false);
});

test("empty Disallow allows, wildcards and end anchors work, comments are ignored", () => {
  assert.equal(isPathAllowed("User-agent: *\nDisallow:\n", UA, "/x"), true);
  const txt = "User-agent: * # all\nDisallow: /busca*\nDisallow: /*.json$ # data\n";
  assert.equal(isPathAllowed(txt, UA, "/buscar?q=1"), false);
  assert.equal(isPathAllowed(txt, UA, "/a/b.json"), false);
  assert.equal(isPathAllowed(txt, UA, "/a/b.json5"), true);
});

test("query strings are part of the matched path", () => {
  const txt = "User-agent: *\nDisallow: /?*page\n";
  assert.equal(isPathAllowed(txt, UA, "/?x=1&page=2"), false);
  assert.equal(isPathAllowed(txt, UA, "/arroz/p"), true);
});
