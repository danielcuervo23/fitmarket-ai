// Copies the LP solver's WebAssembly file into the generate-weekly-plan folder,
// where supabase/config.toml ships it as a static file. Run right before
// deploying (`npm run functions:wasm`, or `npm run deploy:plan-fn`).
import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const HIGHS_WASM_SOURCE = "node_modules/highs/build/highs.wasm";
export const HIGHS_WASM_DEST = "supabase/functions/generate-weekly-plan/highs.wasm";

export async function copyHighsWasm(source = HIGHS_WASM_SOURCE, dest = HIGHS_WASM_DEST) {
  let size;
  try {
    size = (await stat(source)).size;
  } catch {
    throw new Error(`highs.wasm not found at ${source}. Run \`npm ci\` first, then \`npm run functions:wasm\`.`);
  }
  if (size === 0) throw new Error(`highs.wasm at ${source} is empty. Run \`npm ci\` again.`);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(source, dest);
  return size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const size = await copyHighsWasm();
    console.log(`Copied ${HIGHS_WASM_SOURCE} -> ${HIGHS_WASM_DEST} (${size} bytes)`);
  } catch (e) {
    console.error(`functions:wasm failed: ${e.message}`);
    process.exitCode = 1;
  }
}
