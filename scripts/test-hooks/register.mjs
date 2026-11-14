// Loaded with `node --import ./scripts/test-hooks/register.mjs --test ...`.
import { register } from "node:module";

register("./npm-specifiers.mjs", import.meta.url);
