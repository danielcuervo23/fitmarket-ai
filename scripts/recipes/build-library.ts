import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Recipe } from "../../supabase/functions/_shared/recipes/types.ts";
import { foodsFileSchema } from "../foods/foodSchema.ts";
import { buildLibraryModule } from "./libraryModule.ts";
import { foodIndex, recipeFileSchema, validateRecipeFiles, type RecipeFile } from "./recipeSchema.ts";

// Validates data/recipes/*.json and writes the generated recipe library.
//   node scripts/recipes/build-library.ts
// Prints every error and exits 1 (writing nothing) when any recipe is invalid.

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
export const RECIPES_DIR = path.join(root, "data/recipes");
export const FOODS_PATH = path.join(root, "data/foods/foods.json");
export const GENERATED_PATH = path.join(root, "supabase/functions/_shared/recipes/library.generated.ts");

function readRecipeFiles(dir: string): { files: RecipeFile[]; errors: string[] } {
  const files: RecipeFile[] = [];
  const errors: string[] = [];
  for (const fileName of readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    try {
      files.push({ fileName, data: JSON.parse(readFileSync(path.join(dir, fileName), "utf8")) });
    } catch (error) {
      errors.push(`${fileName}: invalid JSON (${(error as Error).message})`);
    }
  }
  return { files, errors };
}

/** The validated recipes of a folder, or every error found (and no recipes). */
export function loadLibrary(dir: string = RECIPES_DIR): { recipes: Recipe[]; errors: string[] } {
  const { foodIds, foodUnits } = foodIndex(foodsFileSchema.parse(JSON.parse(readFileSync(FOODS_PATH, "utf8"))));
  const read = readRecipeFiles(dir);
  const errors = [...read.errors, ...validateRecipeFiles(read.files, foodIds, foodUnits)];
  if (errors.length > 0) return { recipes: [], errors };
  return { recipes: read.files.map((file) => recipeFileSchema.parse(file.data)), errors: [] };
}

/** Ids of the foods flagged `needsSoaking` in data/foods/foods.json. */
export function loadSoakFoods(): string[] {
  const foods = foodsFileSchema.parse(JSON.parse(readFileSync(FOODS_PATH, "utf8")));
  return foods.filter((food) => food.needsSoaking === true).map((food) => food.id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { recipes, errors } = loadLibrary();
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    console.error(`${errors.length} error(s); ${path.relative(root, GENERATED_PATH)} was not written.`);
    process.exit(1);
  }
  writeFileSync(GENERATED_PATH, buildLibraryModule(recipes, loadSoakFoods()));
  console.log(`Wrote ${path.relative(root, GENERATED_PATH)} (${recipes.length} recipes)`);
}
