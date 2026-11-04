// DANE's terms of use allow reuse and transformation of its data only with the
// literal citation "Fuente: Departamento Administrativo Nacional de
// Estadística: www.dane.gov.co" (https://www.dane.gov.co/index.php/terminos-y-condiciones,
// item 2) and say DANE is not responsible for third parties' interpretation
// (item 3). Our estimates are our own calculations, so we say so.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const CITATION = "Fuente: Departamento Administrativo Nacional de Estadística: www.dane.gov.co";

const sourcesBody = (source, locale) => {
  const block = source.slice(source.indexOf(`${locale}: {`));
  const match = /"privacy\.s7\.body":\s*"([^"]+)"/.exec(block);
  assert.ok(match, `privacy.s7.body missing for ${locale}`);
  return match[1];
};

test("the privacy policy cites DANE with the literal wording its terms require (es and en)", () => {
  const legal = read("../../../src/i18n/messages/legal.ts");
  for (const locale of ["es", "en"]) {
    const body = sourcesBody(legal, locale);
    assert.ok(body.includes(CITATION), `${locale}: literal DANE citation`);
    assert.match(body, /SIPSA/, `${locale}: names the SIPSA system`);
  }
  assert.match(sourcesBody(legal, "es"), /cálculos propios/);
  assert.match(sourcesBody(legal, "es"), /no son cifras oficiales del DANE/);
  assert.match(sourcesBody(legal, "en"), /own calculations/);
  assert.match(sourcesBody(legal, "en"), /not official DANE figures/);
});

test("the data-sources doc carries the same citation", () => {
  assert.ok(read("../../../docs/DATA_SOURCES.md").includes(CITATION));
});
