// Packaging for the "Anotar precio" bookmarklet: bundled code -> javascript: URL
// -> install page. Pure string functions (the build script does the bundling).

export const HREF_PLACEHOLDER = "%%BOOKMARKLET_HREF%%";

/** Wraps the bundle in its own scope (no globals leak into the store page) and URL-encodes it. */
export function toBookmarkletUrl(code: string): string {
  return `javascript:${encodeURIComponent(`(()=>{${code}\n})();void 0`)}`;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Puts the bookmarklet URL in the install page template (exactly one placeholder). */
export function renderInstallPage(template: string, bookmarkletUrl: string): string {
  const parts = template.split(HREF_PLACEHOLDER);
  if (parts.length !== 2) throw new Error(`the install page template needs exactly one ${HREF_PLACEHOLDER} placeholder`);
  return `${parts[0]}${escapeAttribute(bookmarkletUrl)}${parts[1]}`;
}
