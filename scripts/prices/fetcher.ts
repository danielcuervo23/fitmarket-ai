import { checkProductUrl } from "./access.ts";
import type { Policy } from "./policy.ts";
import { isPathAllowed } from "./robots.ts";
import type { FetchTextInit, ReaderContext, StoreId } from "./types.ts";

// Polite, policy-enforcing fetcher: one instance per store run. Requests are
// expected to be sequential. It never keeps cookies; a store module that needs
// a cookie (for example the Bucaramanga selector) passes it through `init`.

export const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
const REFUSED = { status: 403, body: "" } as const;
const BLOCK_ALL_ROBOTS = "User-agent: *\nDisallow: /\n";

export interface StoreFetcher {
  fetchText: ReaderContext["fetchText"];
  /** Status that stopped this store (e.g. 429), or null while it may continue. */
  stoppedBy(): number | null;
}

export interface FetcherOptions {
  policy: Policy;
  storeId: StoreId;
  fetch: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createStoreFetcher(opts: FetcherOptions): StoreFetcher {
  const store = opts.policy.stores[opts.storeId];
  if (!store || store.allowed !== true) {
    throw new Error(`Store ${opts.storeId} is not allowed by policy.json`);
  }
  const pattern = store.productPathPattern;
  if (!pattern) throw new Error(`Store ${opts.storeId} has no productPathPattern`);

  const { precautions, userAgent } = opts.policy;
  const robotsUrl = new URL(store.robotsUrl);
  const host = robotsUrl.hostname;
  const delayMs = Math.max(store.minDelayMs, precautions.minDelayMs);
  const stopStatuses = new Set(precautions.stopOnStatus);
  const blockedRules = [...precautions.neverRequest, ...store.disallowedPaths];
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;

  let lastRequestAt: number | null = null;
  let stoppedStatus: number | null = null;
  let robotsTxt: string | null = null;

  const shouldStop = (status: number) => stopStatuses.has(status) || (precautions.stopOnBlock && status === 403);

  // The only code path that touches the network.
  async function request(url: string, headers: Record<string, string>): Promise<{ status: number; body: string; location: string | null }> {
    if (lastRequestAt !== null) {
      const wait = lastRequestAt + delayMs - now();
      if (wait > 0) await sleep(wait);
    }
    lastRequestAt = now();
    try {
      const res = await opts.fetch(url, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await res.text();
      if (shouldStop(res.status)) stoppedStatus = res.status;
      return { status: res.status, body, location: res.headers.get("location") };
    } catch {
      return { status: 599, body: "", location: null };
    }
  }

  function buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(extra ?? {})) {
      const key = k.toLowerCase();
      if (key === "user-agent" || key === "host") continue;
      headers[key] = v;
    }
    headers["user-agent"] = userAgent;
    return headers;
  }

  async function loadRobots(): Promise<void> {
    if (robotsTxt !== null) return;
    const res = await request(robotsUrl.href, buildHeaders());
    if (res.status >= 200 && res.status < 300) robotsTxt = res.body;
    else if (res.status >= 400 && res.status < 500 && stoppedStatus === null) robotsTxt = "";
    else robotsTxt = BLOCK_ALL_ROBOTS; // unreachable robots.txt: assume everything is blocked
  }

  async function fetchText(raw: string, init?: FetchTextInit) {
    const headers = buildHeaders(init?.headers);
    let target = raw;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (stoppedStatus !== null) return { status: stoppedStatus, body: "" };
      const verdict = checkProductUrl(target, host, pattern as string, blockedRules);
      if (!verdict.ok) return { ...REFUSED };
      await loadRobots();
      if (stoppedStatus !== null) return { status: stoppedStatus, body: "" };
      const pathAndQuery = verdict.url.pathname + verdict.url.search;
      if (!isPathAllowed(robotsTxt ?? BLOCK_ALL_ROBOTS, userAgent, pathAndQuery)) return { ...REFUSED };

      const res = await request(verdict.url.href, headers);
      if (res.status >= 300 && res.status < 400 && res.location) {
        try {
          target = new URL(res.location, verdict.url).href;
        } catch {
          return { ...REFUSED };
        }
        continue;
      }
      return { status: res.status, body: res.body };
    }
    return { ...REFUSED };
  }

  return { fetchText, stoppedBy: () => stoppedStatus };
}
