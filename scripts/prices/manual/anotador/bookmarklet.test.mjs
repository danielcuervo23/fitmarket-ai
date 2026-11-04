import assert from "node:assert/strict";
import test from "node:test";
import { renderInstallPage, toBookmarkletUrl } from "./bookmarklet.ts";

test("the bookmarklet URL runs the code inside its own scope and returns nothing", () => {
  const url = toBookmarkletUrl('var A=function(){alert("hola mundo")}();');
  assert.ok(url.startsWith("javascript:"));
  const code = decodeURIComponent(url.slice("javascript:".length));
  assert.equal(code, '(()=>{var A=function(){alert("hola mundo")}();\n})();void 0');
});

test("the bookmarklet URL has no characters that break an HTML attribute or a URL", () => {
  const url = toBookmarkletUrl('a = "<b>" & 50% #x');
  assert.doesNotMatch(url, /[\s"<>&#]/);
  assert.equal(decodeURIComponent(url.slice("javascript:".length)), '(()=>{a = "<b>" & 50% #x\n})();void 0');
});

test("the install page puts the bookmarklet in the link once", () => {
  const page = renderInstallPage('<a href="%%BOOKMARKLET_HREF%%">Anotar precio</a>', "javascript:void%200");
  assert.equal(page, '<a href="javascript:void%200">Anotar precio</a>');
});

test("the install page escapes the link for the attribute", () => {
  const page = renderInstallPage('<a href="%%BOOKMARKLET_HREF%%">x</a>', 'javascript:"&<>');
  assert.equal(page, '<a href="javascript:&quot;&amp;&lt;&gt;">x</a>');
});

test("a template without exactly one placeholder is refused", () => {
  assert.throws(() => renderInstallPage("<p>sin enlace</p>", "javascript:0"), /placeholder/);
  assert.throws(() => renderInstallPage("%%BOOKMARKLET_HREF%% %%BOOKMARKLET_HREF%%", "javascript:0"), /placeholder/);
});
