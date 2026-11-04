// Shared test inputs for the manual price tool (real repo files and store fixtures; no network).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, "../../..");

export const policy = JSON.parse(readFileSync(path.join(root, "scripts/prices/policy.json"), "utf8"));
export const fullFoods = JSON.parse(readFileSync(path.join(root, "data/foods/foods.json"), "utf8"));
export const foods = fullFoods.map((f) => ({ id: f.id, nameEs: f.nameEs, unit: f.unit, defaultPack: f.defaultPack, refPriceCop: f.refPriceCop }));

export const fixture = (name) =>
  JSON.parse(readFileSync(path.join(root, "scripts/prices/stores/fixtures", `${name}.json`), "utf8"));

/** A FastStore (Exito / Carulla) page as the browser serializes it. */
export const fastHtml = (data) =>
  `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;

/** A VTEX IO (Jumbo / D1) page as the browser serializes it. */
export const ioHtml = (state) =>
  `<html><head></head><body><template data-type="json" data-varname="__STATE__"><script>${JSON.stringify(state)}</script></template></body></html>`;
