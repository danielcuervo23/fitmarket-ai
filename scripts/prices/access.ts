import { ruleMatches } from "./robots.ts";

// Pure checks shared by the fetcher and the mapping validator: which URLs a
// store module may ever request.

const SLUG = "[^/?#]+";
const SPECIAL = ".+?^${}()|[]\\*";

/** Turns a policy pattern such as "/<slug>/p" into a regexp for a URL pathname. */
export function productPathRegExp(pattern: string): RegExp {
  const parts = pattern
    .split("<slug>")
    .map((part) => [...part].map((ch) => (SPECIAL.includes(ch) ? `\\${ch}` : ch)).join(""));
  return new RegExp(`^${parts.join(SLUG)}$`);
}

/** Matches policy rules ("/busca*", "/s?", "/account/*") against path + query. */
export function matchesAnyRule(rules: readonly string[], pathAndQuery: string): boolean {
  // Only entries that look like paths are rules; free text such as
  // "any path or parameter blocked by robots.txt" is documentation.
  return rules.some((rule) => rule.startsWith("/") && !/\s/.test(rule) && ruleMatches(rule, pathAndQuery));
}

export type UrlVerdict = { ok: true; url: URL } | { ok: false; why: string };

export function checkProductUrl(
  raw: string,
  host: string,
  productPathPattern: string,
  blockedRules: readonly string[],
): UrlVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, why: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, why: "must be https" };
  if (url.hostname !== host || url.port !== "") return { ok: false, why: "not on host " + host };
  if (url.username || url.password) return { ok: false, why: "credentials in URL" };
  if (url.hash) return { ok: false, why: "fragment in URL" };
  if (!productPathRegExp(productPathPattern).test(url.pathname)) {
    return { ok: false, why: "not a product page (" + productPathPattern + ")" };
  }
  if (matchesAnyRule(blockedRules, url.pathname + url.search)) {
    return { ok: false, why: "path is blocked by policy" };
  }
  return { ok: true, url };
}
