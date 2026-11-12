/**
 * Node resolve hook for tests: the Edge Function code imports Deno-style
 * `npm:` specifiers. Only the pinned ones listed here are mapped to the
 * package installed in node_modules; anything else falls through unchanged,
 * so an unexpected specifier still fails loudly.
 */
const NPM_SPECIFIERS = new Map([["npm:zod@4.6.7", "zod"]]);

export async function resolve(specifier, context, nextResolve) {
  const mapped = NPM_SPECIFIERS.get(specifier);
  return nextResolve(mapped ?? specifier, context);
}
