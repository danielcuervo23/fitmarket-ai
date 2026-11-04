import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createStoreFetcher } from "./fetcher.ts";
import { policySchema } from "./policy.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const policy = policySchema.parse(JSON.parse(readFileSync(path.join(here, "policy.json"), "utf8")));
const UA = "FitMarketPriceBot/1.0 (+https://fitmarket-ai.vercel.app)";
const PRODUCT = "https://www.exito.com/arroz-diana-500g/p";
const ROBOTS = "https://www.exito.com/robots.txt";
const isRobots = (u) => u.endsWith("/robots.txt");

function harness(routes = {}) {
  const calls = [];
  let clock = 1_000_000;
  const sleeps = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), init, at: clock });
    const fallback = isRobots(String(url))
      ? { status: 200, body: "User-agent: *\nDisallow: /checkout/\n" }
      : { status: 200, body: "<html>ok</html>" };
    const hit = routes[String(url)] ?? fallback;
    const r = typeof hit === "function" ? hit() : hit;
    return new Response(r.body ?? "", { status: r.status, headers: r.headers });
  };
  const make = (storeId = "Exito") =>
    createStoreFetcher({
      policy,
      storeId,
      fetch: fakeFetch,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
  const productCalls = () => calls.filter((c) => !isRobots(c.url));
  return { calls, sleeps, make, productCalls, tick: (ms) => (clock += ms) };
}

test("refuses a store that is not allowed", () => {
  const h = harness();
  assert.throws(() => h.make("Ara"), /not allowed/i);
  assert.equal(h.calls.length, 0);
});

test("sends the exact user agent, passes headers through and ignores a user-agent override", async () => {
  const h = harness();
  const f = h.make();
  const res = await f.fetchText(PRODUCT, { headers: { Cookie: "vtex_segment=abc", "User-Agent": "evil" } });
  assert.equal(res.status, 200);
  const last = h.calls.at(-1);
  const headers = new Headers(last.init.headers);
  assert.equal(headers.get("user-agent"), UA);
  assert.equal(headers.get("cookie"), "vtex_segment=abc");
  assert.ok(last.init.signal, "has a timeout signal");
});

test("robots.txt is fetched once per store", async () => {
  const h = harness();
  const f = h.make();
  await f.fetchText(PRODUCT);
  await f.fetchText("https://www.exito.com/otro-arroz/p");
  assert.equal(h.calls.filter((c) => isRobots(c.url)).length, 1);
});

test("a path blocked by robots.txt never reaches the network", async () => {
  const h = harness({ [ROBOTS]: { status: 200, body: "User-agent: *\nDisallow: /secreto\n" } });
  const f = h.make();
  const res = await f.fetchText("https://www.exito.com/secreto/p");
  assert.deepEqual(res, { status: 403, body: "" });
  assert.equal(h.productCalls().length, 0);
  assert.equal(f.stoppedBy(), null, "own refusal does not stop the store");
});

test("only product pages on the store host over https are requested", async () => {
  const h = harness();
  const f = h.make();
  for (const url of [
    "https://www.exito.com/",
    "https://www.exito.com/a/b/p",
    "https://www.exito.com/arroz/p/extra",
    "http://www.exito.com/arroz/p",
    "https://www.carulla.com/arroz/p",
    "https://user:pw@www.exito.com/arroz/p",
    "not a url",
  ]) {
    assert.deepEqual(await f.fetchText(url), { status: 403, body: "" }, url);
  }
  assert.equal(h.productCalls().length, 0);
});

test("neverRequest and the store's disallowedPaths are enforced even when robots.txt allows", async () => {
  const h = harness({ [ROBOTS]: { status: 200, body: "" } });
  // "/busca*" is in neverRequest and "/<slug>/p" would accept the slug "busca"
  assert.deepEqual(await h.make().fetchText("https://www.exito.com/busca/p"), { status: 403, body: "" });
  const d1 = harness({ "https://domicilios.tiendasd1.com/robots.txt": { status: 200, body: "" } });
  assert.deepEqual(await d1.make("D1").fetchText("https://domicilios.tiendasd1.com/checkout/p"), {
    status: 403,
    body: "",
  });
  assert.equal(d1.productCalls().length, 0);
});

test("query strings are allowed on product pages", async () => {
  const h = harness();
  assert.equal((await h.make().fetchText(PRODUCT + "?sc=12")).status, 200);
});

test("waits at least minDelayMs between requests to the same store", async () => {
  const h = harness();
  const f = h.make();
  await f.fetchText(PRODUCT);
  await f.fetchText("https://www.exito.com/otro/p");
  await f.fetchText("https://www.exito.com/otro2/p");
  const times = h.calls.map((c) => c.at);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 5000, "gap " + i);
});

test("does not wait when enough time already passed", async () => {
  const h = harness();
  const f = h.make();
  await f.fetchText(PRODUCT);
  h.tick(6000);
  const n = h.sleeps.length;
  await f.fetchText("https://www.exito.com/otro/p");
  assert.equal(h.sleeps.length, n);
});

test("a 429 stops the store: nothing else is requested", async () => {
  const h = harness({ [PRODUCT]: { status: 429, body: "slow down" } });
  const f = h.make();
  assert.equal((await f.fetchText(PRODUCT)).status, 429);
  assert.equal(f.stoppedBy(), 429);
  const n = h.calls.length;
  assert.equal((await f.fetchText("https://www.exito.com/otro/p")).status, 429);
  assert.equal(h.calls.length, n);
});

test("a real 403 from the store stops it too (stopOnBlock)", async () => {
  const h = harness({ [PRODUCT]: { status: 403, body: "" } });
  const f = h.make();
  await f.fetchText(PRODUCT);
  assert.equal(f.stoppedBy(), 403);
});

test("robots.txt answers: 429 stops, 404 allows all, 500 blocks all", async () => {
  const r429 = harness({ [ROBOTS]: { status: 429, body: "" } });
  const f429 = r429.make();
  assert.equal((await f429.fetchText(PRODUCT)).status, 429);
  assert.equal(f429.stoppedBy(), 429);
  assert.equal(r429.productCalls().length, 0);

  const r404 = harness({ [ROBOTS]: { status: 404, body: "" } });
  assert.equal((await r404.make().fetchText(PRODUCT)).status, 200);

  const r500 = harness({ [ROBOTS]: { status: 500, body: "" } });
  assert.deepEqual(await r500.make().fetchText(PRODUCT), { status: 403, body: "" });
  assert.equal(r500.productCalls().length, 0);
});

test("redirects are followed only to allowed product urls and never to another host", async () => {
  const ok = harness({ [PRODUCT]: { status: 301, headers: { location: "/arroz-nuevo/p" } } });
  const res = await ok.make().fetchText(PRODUCT);
  assert.equal(res.status, 200);
  assert.ok(ok.calls.some((c) => c.url === "https://www.exito.com/arroz-nuevo/p"));

  const bad = harness({ [PRODUCT]: { status: 302, headers: { location: "https://evil.example.com/x/p" } } });
  const res2 = await bad.make().fetchText(PRODUCT);
  assert.equal(res2.status, 403);
  assert.ok(!bad.calls.some((c) => c.url.includes("evil.example.com")));
});

test("a network error returns a 599 body-less answer instead of throwing", async () => {
  const h = harness({
    [PRODUCT]: () => {
      throw new Error("boom");
    },
  });
  assert.deepEqual(await h.make().fetchText(PRODUCT), { status: 599, body: "" });
});
