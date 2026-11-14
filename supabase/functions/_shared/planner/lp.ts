// LP solver adapter. This is the ONLY file that knows which LP library is used:
// `highs` (HiGHS compiled to WebAssembly, MIT). It is resolved from
// node_modules in Node and through the function's deno.json import map
// ("highs": "npm:highs@1.15.4") in Deno. Swapping the library means changing
// this file only.
//
// Lifecycle: `prepareLp()` (async) loads the WASM once per instance and caches
// it; concurrent callers share the same load and a failed load is retried on
// the next call. `solveLp()` is synchronous; before a successful prepareLp it
// answers `error: "solver_error"`.
//
// Contract: neither function throws. Invalid input, a solver exception or an
// unexpected solver answer all come back as `feasible: false` with an `error`
// code, so callers can diagnose without try/catch and logs carry codes only.
//
// Safety: caller names (which may come from catalog or user text) never enter
// the LP text. Variables are written as x0…xN and rows as c0…cM, and mapped
// back by position.
import type { LegacyHighs } from "highs";

export interface LpConstraint { min?: number; max?: number; equal?: number }
export interface LpModel {
  optimize: string; opType: "min";
  constraints: Record<string, LpConstraint>;
  variables: Record<string, Record<string, number>>; // all variables are >= 0
}
export type LpError = "invalid_model" | "solver_error" | "invalid_result" | "time_limit";
export interface LpSolution {
  feasible: boolean;
  bounded: boolean; // false when the objective can decrease without limit
  objective: number; // +Infinity when not feasible
  values: Record<string, number>; // every model variable, 0 when absent from the solver answer
  cpuMs: number;
  error?: LpError; // set only when the model or the solver answer could not be used
}

/** Returns the bytes of `highs.wasm`. */
export type WasmLoader = () => Promise<ArrayBuffer | ArrayBufferView>;
export interface PrepareLpOptions {
  loadWasm?: WasmLoader;
  loadTimeoutMs?: number; // default LP_LOAD_TIMEOUT_MS
}
/** Why the last load failed: a code only, safe to log (never paths or messages). */
export type LpLoadError = "wasm_not_found" | "wasm_instantiate_failed" | "load_timeout";
export interface SolveLpOptions {
  /**
   * Time this call may use, in ms (default LP_DEFAULT_TIME_LIMIT_MS, clamped to
   * [0, LP_MAX_TIME_LIMIT_MS]). Passed to HiGHS as its own `time_limit` option;
   * a presolve-off retry only gets what is left. Callers pass
   * min(remaining planner budget, LP_DEFAULT_TIME_LIMIT_MS).
   */
  timeLimitMs?: number;
}

// CPU guard: the planner's model is about 320 variables and 400 rows.
export const LP_MAX_VARIABLES = 1000;
export const LP_MAX_CONSTRAINTS = 1000;
// HiGHS treats |values| >= 1e15 (matrix) and >= 1e20 (bounds, costs) as
// infinite; anything near that is a bug in the model builder, not data.
export const LP_MAX_ABS_VALUE = 1e12;
export const LP_DEFAULT_TIME_LIMIT_MS = 800;
export const LP_MAX_TIME_LIMIT_MS = 1500; // below the Edge Function's 2 s CPU limit
export const LP_LOAD_TIMEOUT_MS = 5000;
const ZERO_TOLERANCE = 1e-9;

// ---------------------------------------------------------------------------
// Loading

type LpSolver = Pick<LegacyHighs, "solve">;
type LoadOutcome = { ok: true; solver: LpSolver } | { ok: false; error: LpLoadError };

let solver: LpSolver | null = null;
let loading: Promise<boolean> | null = null;
let lastLoadError: LpLoadError | null = null;
let attempt = 0; // a result from an older attempt (timed out or reset) is ignored

type DenoFs = { readFile(path: string | URL): Promise<Uint8Array>; mainModule: string };

/**
 * Edge Function: `highs.wasm` ships as a static file of `generate-weekly-plan`
 * (`static_files` in supabase/config.toml), next to the function entry.
 * Node (tests, scripts): the file inside node_modules/highs.
 */
async function defaultWasmBytes(): Promise<Uint8Array> {
  const deno = (globalThis as { Deno?: Partial<DenoFs> }).Deno;
  if (deno && typeof deno.readFile === "function") {
    const candidates: (string | URL)[] = ["./highs.wasm"];
    if (typeof deno.mainModule === "string") candidates.unshift(new URL("./highs.wasm", deno.mainModule));
    let lastError: unknown = new Error("highs.wasm not found");
    for (const path of candidates) {
      try {
        return await deno.readFile(path);
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError;
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(import.meta.resolve("highs/runtime")));
}

// Emscripten hook (missing from highs' published types). highs 1.15.4 ignores
// its typed `wasmBinary` option and would fetch `highs.wasm` next to its own
// script, which a bundled Edge Function cannot do, so we instantiate the bytes
// we were given ourselves.
type InstantiateWasm = (
  imports: WebAssembly.Imports,
  done: (instance: WebAssembly.Instance) => void,
) => Record<string, never>;

async function load(loadWasm: WasmLoader): Promise<LoadOutcome> {
  let bytes: ArrayBuffer | ArrayBufferView;
  try {
    bytes = await loadWasm();
  } catch {
    return { ok: false, error: "wasm_not_found" };
  }
  try {
    const { default: highsLoader } = await import("highs");
    // Emscripten waits forever if instantiateWasm never calls `done`, so a
    // failed instantiation must reject on its own path.
    let fail: (e: unknown) => void = () => {};
    const failed = new Promise<never>((_, reject) => { fail = reject; });
    const instantiateWasm: InstantiateWasm = (imports, done) => {
      WebAssembly.instantiate(bytes as BufferSource, imports).then((r) => done(r.instance), fail);
      return {};
    };
    const options: Parameters<typeof highsLoader>[0] & { instantiateWasm: InstantiateWasm } = { instantiateWasm };
    const instance = await Promise.race([highsLoader(options), failed]);
    if (typeof instance?.solve !== "function") return { ok: false, error: "wasm_instantiate_failed" };
    return { ok: true, solver: instance };
  } catch {
    return { ok: false, error: "wasm_instantiate_failed" };
  }
}

const positiveOr = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;

/**
 * Loads the solver once per instance. Resolves true when ready, false when the
 * load failed or took longer than `loadTimeoutMs` (never rejects; the reason is
 * in `lpLoadError()`). A failed or timed-out load is forgotten, so the next
 * call tries again; `options` only matter for the call that starts a load.
 */
export function prepareLp(options: PrepareLpOptions = {}): Promise<boolean> {
  if (solver !== null) return Promise.resolve(true);
  if (loading === null) {
    const id = ++attempt;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<LoadOutcome>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, error: "load_timeout" }),
        positiveOr(options.loadTimeoutMs, LP_LOAD_TIMEOUT_MS),
      );
    });
    loading = Promise.race([load(options.loadWasm ?? defaultWasmBytes), timeout]).then((outcome) => {
      clearTimeout(timer);
      if (id !== attempt) return solver !== null;
      loading = null;
      if (outcome.ok) {
        solver = outcome.solver;
        lastLoadError = null;
        return true;
      }
      lastLoadError = outcome.error;
      return false;
    });
  }
  return loading;
}

/** Code of the last failed load, or null (never tried, loading, or ready). */
export function lpLoadError(): LpLoadError | null {
  return solver === null ? lastLoadError : null;
}

/**
 * TEST ONLY: replaces the loaded solver (null = back to "not loaded") and
 * forgets any load in progress or past error.
 */
export function __setLpSolverForTests(fake: LpSolver | null): void {
  attempt++;
  solver = fake;
  loading = null;
  lastLoadError = null;
}

// ---------------------------------------------------------------------------
// Input validation

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isSafeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LP_MAX_ABS_VALUE;
// Names are only used as object keys; "__proto__" would not round-trip.
const isUsableName = (name: string): boolean => name.length > 0 && name !== "__proto__";

function readConstraint(raw: unknown): LpConstraint | null {
  if (!isRecord(raw)) return null;
  const out: LpConstraint = {};
  for (const key of ["min", "max", "equal"] as const) {
    const v = raw[key];
    if (v === undefined) continue;
    if (!isSafeNumber(v)) return null;
    out[key] = v;
  }
  if (out.min === undefined && out.max === undefined && out.equal === undefined) return null;
  if (out.min !== undefined && out.max !== undefined && out.min > out.max) return null;
  return out;
}

function readCoefficients(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const out: Record<string, number> = {};
  for (const key of Object.keys(raw)) {
    const v = raw[key];
    if (!isUsableName(key) || !isSafeNumber(v)) return null;
    out[key] = v;
  }
  return out;
}

/** Returns a validated copy, or null. */
function readModel(raw: unknown): LpModel | null {
  if (!isRecord(raw)) return null;
  const { optimize, opType, constraints, variables } = raw;
  if (typeof optimize !== "string" || !isUsableName(optimize)) return null;
  if (opType !== "min") return null;
  if (!isRecord(constraints) || !isRecord(variables)) return null;

  const constraintNames = Object.keys(constraints);
  const variableNames = Object.keys(variables);
  if (constraintNames.length > LP_MAX_CONSTRAINTS || variableNames.length > LP_MAX_VARIABLES) return null;

  const outConstraints: Record<string, LpConstraint> = {};
  for (const name of constraintNames) {
    const c = readConstraint(constraints[name]);
    if (!isUsableName(name) || c === null) return null;
    outConstraints[name] = c;
  }
  const outVariables: Record<string, Record<string, number>> = {};
  for (const name of variableNames) {
    const coeffs = readCoefficients(variables[name]);
    if (!isUsableName(name) || coeffs === null) return null;
    outVariables[name] = coeffs;
  }
  return { optimize, opType, constraints: outConstraints, variables: outVariables };
}

// ---------------------------------------------------------------------------
// LP text (CPLEX LP format) with generated names only

type Term = readonly [column: number, coefficient: number];
type Sense = ">=" | "<=" | "=";

const colName = (i: number): string => `x${i}`;

const linear = (terms: readonly Term[]): string =>
  terms.map(([col, coef]) => `${coef < 0 ? "-" : "+"} ${Math.abs(coef)} ${colName(col)}`).join(" ");

/** A row nothing touches reads 0; checked here instead of being sent to the solver. */
function zeroHolds(sense: Sense, rhs: number): boolean {
  if (sense === ">=") return rhs <= ZERO_TOLERANCE;
  if (sense === "<=") return rhs >= -ZERO_TOLERANCE;
  return Math.abs(rhs) <= ZERO_TOLERANCE;
}

/** The LP text, or null when an empty row already makes the model infeasible. */
function buildLpText(model: LpModel, variableNames: readonly string[]): string | null {
  const constraintNames = Object.keys(model.constraints);
  const rowOf = new Map<string, number>(constraintNames.map((name, i) => [name, i]));
  const objective: Term[] = [];
  const rows: Term[][] = constraintNames.map(() => []);

  variableNames.forEach((name, col) => {
    const coeffs = model.variables[name];
    for (const attr of Object.keys(coeffs)) {
      const coef = coeffs[attr];
      if (coef === 0) continue;
      if (attr === model.optimize) objective.push([col, coef]);
      const row = rowOf.get(attr);
      if (row !== undefined) rows[row].push([col, coef]);
    }
  });

  const lines: string[] = [];
  for (let i = 0; i < constraintNames.length; i++) {
    const { min, max, equal } = model.constraints[constraintNames[i]];
    const bounds: [Sense, number][] = [];
    if (min !== undefined) bounds.push([">=", min]);
    if (max !== undefined) bounds.push(["<=", max]);
    if (equal !== undefined) bounds.push(["=", equal]);
    for (const [sense, rhs] of bounds) {
      if (rows[i].length === 0) {
        if (!zeroHolds(sense, rhs)) return null;
        continue;
      }
      lines.push(` c${lines.length}: ${linear(rows[i])} ${sense} ${rhs}`);
    }
  }

  const objectiveText = objective.length > 0 ? linear(objective) : `0 ${colName(0)}`;
  const constraintsText = lines.length > 0 ? ["Subject To", ...lines] : [];
  return ["Minimize", ` obj: ${objectiveText}`, ...constraintsText, "End", ""].join("\n");
}

// ---------------------------------------------------------------------------
// Solver answer

export type SolverRead =
  | { kind: "optimal"; objective: number; primal: number[] }
  | { kind: "infeasible" }
  | { kind: "unbounded" }
  | { kind: "ambiguous" } // HiGHS presolve: "infeasible or unbounded"
  | { kind: "error"; error: "time_limit" | "solver_error" }
  | { kind: "invalid" };

/** Checks a HiGHS answer at runtime; values are read by generated column name x0…x(n-1). */
export function readSolverResult(raw: unknown, columnCount: number): SolverRead {
  if (!isRecord(raw) || typeof raw.Status !== "string") return { kind: "invalid" };
  switch (raw.Status) {
    case "Optimal":
    case "Empty":
      break;
    case "Infeasible":
      return { kind: "infeasible" };
    case "Unbounded":
      return { kind: "unbounded" };
    case "Primal infeasible or unbounded":
      return { kind: "ambiguous" };
    case "Time limit reached":
    case "Iteration limit reached":
      return { kind: "error", error: "time_limit" };
    default:
      return { kind: "error", error: "solver_error" };
  }
  const objective = raw.ObjectiveValue;
  const columns = raw.Columns;
  if (typeof objective !== "number" || !Number.isFinite(objective) || !isRecord(columns)) return { kind: "invalid" };
  const primal: number[] = [];
  for (let i = 0; i < columnCount; i++) {
    const column = columns[colName(i)];
    if (column === undefined) {
      primal.push(0);
      continue;
    }
    if (!isRecord(column) || typeof column.Primal !== "number" || !Number.isFinite(column.Primal)) return { kind: "invalid" };
    primal.push(column.Primal);
  }
  return { kind: "optimal", objective, primal };
}

// ---------------------------------------------------------------------------
// Solve

const failure = (error: LpError, cpuMs: number): LpSolution => ({
  feasible: false, bounded: false, objective: Number.POSITIVE_INFINITY, values: {}, cpuMs, error,
});

/** Default for a missing or non-finite value; otherwise clamped to [0, LP_MAX_TIME_LIMIT_MS]. */
function timeLimitOf(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return LP_DEFAULT_TIME_LIMIT_MS;
  return Math.min(Math.max(v, 0), LP_MAX_TIME_LIMIT_MS);
}

const zeros = (names: readonly string[]): Record<string, number> => Object.fromEntries(names.map((n) => [n, 0]));

function toSolution(read: SolverRead, names: readonly string[], cpuMs: number): LpSolution {
  switch (read.kind) {
    case "optimal":
      return {
        feasible: true, bounded: true, objective: read.objective,
        values: Object.fromEntries(names.map((n, i) => [n, read.primal[i]])), cpuMs,
      };
    case "infeasible":
      return { feasible: false, bounded: true, objective: Number.POSITIVE_INFINITY, values: zeros(names), cpuMs };
    case "unbounded":
    case "ambiguous":
      return { feasible: false, bounded: false, objective: Number.NEGATIVE_INFINITY, values: zeros(names), cpuMs };
    case "error":
      return failure(read.error, cpuMs);
    case "invalid":
      return failure("invalid_result", cpuMs);
  }
}

/**
 * Minimises `model.optimize` subject to the constraints; all variables are >= 0.
 * `now` is a millisecond clock (injectable for tests). The call is synchronous,
 * so wall time measured around it approximates CPU time. Primal values carry
 * solver noise: callers treat values <= 1e-6 as zero.
 */
export function solveLp(
  model: LpModel,
  now: () => number = () => performance.now(),
  options: SolveLpOptions = {},
): LpSolution {
  const start = now();
  const elapsed = () => now() - start;
  const limitMs = timeLimitOf(options.timeLimitMs);
  // HiGHS's own `time_limit` option, in seconds, for whatever time is left.
  const solveWithin = (text: string, retry: boolean): unknown | null => {
    const leftMs = limitMs - elapsed();
    if (!(solver !== null && leftMs > 0)) return null;
    return solver.solve(text, retry ? { time_limit: leftMs / 1000, presolve: "off" } : { time_limit: leftMs / 1000 });
  };
  try {
    const safe = readModel(model);
    if (safe === null) return failure("invalid_model", elapsed());
    const names = Object.keys(safe.variables);

    const text = buildLpText(safe, names);
    if (text === null) return toSolution({ kind: "infeasible" }, names, elapsed());
    // No variables and every row holds at 0: the empty plan is optimal.
    if (names.length === 0) return toSolution({ kind: "optimal", objective: 0, primal: [] }, names, elapsed());
    if (solver === null) return failure("solver_error", elapsed());

    const first = solveWithin(text, false);
    if (first === null) return failure("time_limit", elapsed());
    let read = readSolverResult(first, names.length);
    if (read.kind === "ambiguous") {
      // Presolve could not tell infeasible from unbounded; the simplex can,
      // within the time that is left.
      const retry = solveWithin(text, true);
      if (retry === null) return failure("time_limit", elapsed());
      read = readSolverResult(retry, names.length);
    }
    return toSolution(read, names, elapsed());
  } catch {
    return failure("solver_error", elapsed());
  }
}
