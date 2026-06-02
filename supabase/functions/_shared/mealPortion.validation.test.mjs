/** Ejecutar: node supabase/functions/_shared/mealPortion.validation.test.mjs */

const MEAL_PORTION_PATTERN =
  /\d+\s*(?:g|gr|gramos|ml|mililitros|kg|kilogramos|l|litro|litros|unidad|unidades|rodaja|rodajas|taza|tazas)\b|\d+\s+(?:de\s+)?[a-záéíóúñ]/i;

const cases = [
  ["80 g de avena en hojuelas", true],
  ["1 banano mediano", true],
  ["250 ml de leche", true],
  ["150 g de pechuga de pollo", true],
  ["Avena con banano", false],
  ["Pollo con arroz", false],
  ["Yogur con nueces", false],
];

let passed = 0;
let failed = 0;

for (const [text, expected] of cases) {
  const result = MEAL_PORTION_PATTERN.test(text);
  if (result === expected) {
    passed++;
    console.log(`PASS: "${text}"`);
  } else {
    failed++;
    console.error(`FAIL: "${text}" got ${result}, expected ${expected}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
