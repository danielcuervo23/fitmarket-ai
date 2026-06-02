function normalizeForMatching(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsProhibitedTerm(text, term) {
  const normalized = normalizeForMatching(text);
  const normalizedTerm = normalizeForMatching(term.trim());
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return normalized.includes(normalizedTerm);
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(normalizedTerm)}(?:[^a-z0-9]|$)`,
  );
  return pattern.test(normalized);
}

const cases = [
  ["Ensalada de lechuga", "leche", false],
  ["Leche entera", "leche", true],
  ["Pollo a la plancha", "pollo", true],
  ["Batido de fresas", "res", false],
  ["Carne de res", "res", true],
  ["Filete de salmon", "salmon", true],
  ["Salmón al horno", "salmon", true],
  ["Camarones al ajillo", "camarones", true],
  ["Maní tostado", "mani", true],
  ["Empanada", "pan", false],
  ["Pan integral", "pan", true],
  ["Atún en lata", "atun", true],
  ["Solo pescado", "pescado", true],
];

let passed = 0;
let failed = 0;

for (const [text, term, expected] of cases) {
  const result = textContainsProhibitedTerm(text, term);
  if (result === expected) {
    passed++;
    console.log(`PASS: "${text}" / "${term}"`);
  } else {
    failed++;
    console.error(`FAIL: "${text}" / "${term}" got ${result}, expected ${expected}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
