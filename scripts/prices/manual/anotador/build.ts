import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build, type Rollup } from "vite";
import { policySchema } from "../../policy.ts";
import { storeSitesFromPolicy, type SlimFood } from "../format.ts";
import { renderInstallPage, toBookmarkletUrl } from "./bookmarklet.ts";

// Builds the "Anotar precio" bookmarklet and writes tools/anotador/index.html.
//   npm run anotador:build
// The store sites (allowed stores from policy.json) and the 70 foods (id, Spanish
// name, unit, usual pack only) are baked in at build time.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..", "..", "..");
export const INSTALL_PAGE = path.join(root, "tools/anotador/index.html");
const TEMPLATE = path.join(here, "install.template.html");

export async function buildBookmarkletUrl(): Promise<string> {
  const policy = policySchema.parse(JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8")));
  const foods: SlimFood[] = (JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8")) as SlimFood[]).map(
    (f) => ({ id: f.id, nameEs: f.nameEs, unit: f.unit, defaultPack: f.defaultPack }),
  );
  const result = await build({
    configFile: false,
    root: here,
    publicDir: false,
    logLevel: "silent",
    define: {
      __ANOTADOR_SITES__: JSON.stringify(storeSitesFromPolicy(policy)),
      __ANOTADOR_FOODS__: JSON.stringify(foods),
    },
    build: {
      write: false,
      target: "es2020",
      minify: "esbuild",
      lib: { entry: path.join(here, "main.ts"), formats: ["iife"], name: "FitMarketAnotador", fileName: () => "anotador.js" },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const chunk = outputs.flatMap((o) => o.output).find((o): o is Rollup.OutputChunk => o.type === "chunk");
  if (!chunk) throw new Error("the bookmarklet bundle is empty");
  return toBookmarkletUrl(chunk.code.trim());
}

export async function buildInstallPage(): Promise<string> {
  return renderInstallPage(readFileSync(TEMPLATE, "utf8"), await buildBookmarkletUrl());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const page = await buildInstallPage();
  writeFileSync(INSTALL_PAGE, page);
  console.log(`Wrote ${path.relative(root, INSTALL_PAGE)} (${page.length} characters)`);
}
