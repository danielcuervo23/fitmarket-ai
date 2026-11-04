// Minimal robots.txt reader (RFC 9309 subset): groups by User-agent, Allow and
// Disallow with `*` and `$`, the longest matching rule wins and Allow wins a
// tie. The product token (before "/" or space) picks the group; a specific
// group beats "*".

interface Rule {
  allow: boolean;
  pattern: string;
}

function productToken(userAgent: string): string {
  return userAgent.split(/[\s/]/)[0]?.toLowerCase() ?? "";
}

const SPECIAL = ".+?^${}()|[]\\";

export function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => [...part].map((ch) => (SPECIAL.includes(ch) ? `\\${ch}` : ch)).join(""))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

export function ruleMatches(pattern: string, path: string): boolean {
  return patternToRegExp(pattern).test(path);
}

function parseGroups(robotsTxt: string): { agents: string[]; rules: Rule[] }[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      lastWasAgent = false;
      if (current && value !== "") current.rules.push({ allow: key === "allow", pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

// Decodes percent-encoded UNRESERVED characters (letters, digits, - . _ ~) so
// "/%62usca" is matched as "/busca". Reserved characters such as %2F stay encoded.
export function normalizePath(pathAndQuery: string): string {
  return pathAndQuery.replace(/%([0-9A-Fa-f]{2})/g, (match, hex: string) => {
    const ch = String.fromCharCode(parseInt(hex, 16));
    return /[A-Za-z0-9\-._~]/.test(ch) ? ch : match.toUpperCase();
  });
}

export function isPathAllowed(robotsTxt: string, userAgent: string, rawPath: string): boolean {
  const path = normalizePath(rawPath);
  const token = productToken(userAgent);
  const groups = parseGroups(robotsTxt);
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && productToken(a) === token));
  const chosen = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes("*"));
  let best: Rule | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!ruleMatches(rule.pattern, path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
