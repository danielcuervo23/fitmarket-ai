import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { before, test } from "node:test";
import { LP_MAX_ABS_VALUE, LP_MAX_CONSTRAINTS, LP_MAX_VARIABLES, prepareLp, readSolverResult, solveLp } from "./lp.ts";

// A fresh copy of the adapter (own module state: nothing loaded yet).
let freshCount = 0;
const freshLp = () => import(`./lp.ts?fresh=${++freshCount}`);
const wasmBytes = () => readFile(new URL(import.meta.resolve("highs/runtime")));

// Two foods, two nutrient floors. Vertices: (3,0) costs 0.09, (0,3) costs 0.15,
// (1,1) costs 0.08 — the optimum. "extra" is never worth buying.
const dietModel = () => ({
  optimize: "cost",
  opType: "min",
  constraints: { protein: { min: 3 }, carbs: { min: 3 } },
  variables: {
    a: { cost: 0.03, protein: 1, carbs: 2 },
    b: { cost: 0.05, protein: 2, carbs: 1 },
    extra: { cost: 1, protein: 1 },
  },
});

// Deterministic covering model: every row is a ">= 1" floor with positive
// coefficients, so it is always feasible and bounded.
function syntheticModel(nVars, nRows) {
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const constraints = {};
  for (let r = 0; r < nRows; r++) constraints[`r${r}`] = { min: 1 };
  const variables = {};
  for (let v = 0; v < nVars; v++) {
    const coeffs = { cost: 1 + rand() * 9 };
    for (let k = 0; k < 8; k++) coeffs[`r${Math.floor(rand() * nRows)}`] = 0.5 + rand();
    variables[`v${v}`] = coeffs;
  }
  // Guarantee every row is covered by at least one variable.
  for (let r = 0; r < nRows; r++) variables[`v${r % nVars}`][`r${r}`] ??= 1;
  return { optimize: "cost", opType: "min", constraints, variables };
}

const near = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg}: expected ${expected}, got ${actual}`);

// --- loading -----------------------------------------------------------------

test("solveLp before prepareLp answers solver_error and does not throw", async () => {
  const lp = await freshLp();
  const s = lp.solveLp(dietModel());
  assert.equal(s.feasible, false);
  assert.equal(s.error, "solver_error");
});

test("concurrent prepareLp calls share one load", async () => {
  const lp = await freshLp();
  let loads = 0;
  const loadWasm = async () => { loads++; return wasmBytes(); };
  const [a, b] = await Promise.all([lp.prepareLp({ loadWasm }), lp.prepareLp({ loadWasm })]);
  assert.equal(a, true);
  assert.equal(b, true);
  assert.equal(await lp.prepareLp({ loadWasm }), true);
  assert.equal(loads, 1);
  assert.equal(lp.solveLp(dietModel()).feasible, true);
});

test("a failed load resolves false, is not cached, and the next call retries", async () => {
  const lp = await freshLp();
  let loads = 0;
  const loadWasm = async () => {
    loads++;
    if (loads === 1) throw new Error("disk hiccup");
    return wasmBytes();
  };
  assert.equal(await lp.prepareLp({ loadWasm }), false);
  assert.equal(lp.solveLp(dietModel()).error, "solver_error");
  assert.equal(await lp.prepareLp({ loadWasm }), true);
  assert.equal(loads, 2);
  assert.equal(lp.solveLp(dietModel()).feasible, true);
});

test("invalid wasm bytes resolve false instead of throwing", async () => {
  const lp = await freshLp();
  assert.equal(await lp.prepareLp({ loadWasm: async () => new Uint8Array([1, 2, 3]) }), false);
});

before(async () => {
  assert.equal(await prepareLp(), true, "default wasm loader works in Node");
});

// --- solving -----------------------------------------------------------------

test("classic diet LP: optimum and values", () => {
  const s = solveLp(dietModel());
  assert.equal(s.feasible, true);
  assert.equal(s.bounded, true);
  near(s.objective, 0.08, "objective");
  near(s.values.a, 1, "a");
  near(s.values.b, 1, "b");
  assert.equal(s.error, undefined);
});

test("infeasible model reports feasible=false", () => {
  const s = solveLp({
    optimize: "cost",
    opType: "min",
    constraints: { low: { max: 1 }, high: { min: 2 } },
    variables: { x: { cost: 1, low: 1, high: 1 } },
  });
  assert.equal(s.feasible, false);
  assert.equal(s.objective, Number.POSITIVE_INFINITY);
  assert.equal(s.error, undefined);
});

test("absent variables come back as 0", () => {
  const s = solveLp(dietModel());
  assert.ok(Object.hasOwn(s.values, "extra"));
  assert.equal(s.values.extra, 0);
  assert.deepEqual(Object.keys(s.values).sort(), ["a", "b", "extra"]);
});

test("a variable in no row and with no cost comes back as 0", () => {
  const m = dietModel();
  m.variables.idle = {};
  const s = solveLp(m);
  assert.equal(s.feasible, true);
  assert.equal(s.values.idle, 0);
});

test("unbounded model reports bounded=false", () => {
  const s = solveLp({
    optimize: "cost",
    opType: "min",
    constraints: { floor: { min: 1 } },
    variables: { x: { cost: -1, floor: 1 } },
  });
  assert.equal(s.bounded, false);
  assert.equal(s.feasible, false);
  assert.equal(s.error, undefined);
});

test("equal constraints are honoured", () => {
  const s = solveLp({
    optimize: "cost",
    opType: "min",
    constraints: { total: { equal: 4 } },
    variables: { x: { cost: 2, total: 1 }, y: { cost: 3, total: 1 } },
  });
  assert.equal(s.feasible, true);
  near(s.values.x, 4, "x");
  near(s.objective, 8, "objective");
});

test("a constraint with both min and max keeps both", () => {
  const model = (cost) => ({
    optimize: "cost",
    opType: "min",
    constraints: { band: { min: 2, max: 5 } },
    variables: { x: { cost, band: 1 } },
  });
  near(solveLp(model(1)).values.x, 2, "cheap direction hits min");
  near(solveLp(model(-1)).values.x, 5, "rewarding direction hits max");
});

test("negative and very small coefficients are written correctly", () => {
  const s = solveLp({
    optimize: "cost",
    opType: "min",
    constraints: { net: { min: 1 }, cap: { max: 3 } },
    variables: { x: { cost: 1e-7, net: 2, cap: 1 }, y: { cost: 1, net: -1, cap: 1 } },
  });
  assert.equal(s.feasible, true);
  near(s.values.x, 0.5, "x");
  near(s.values.y, 0, "y");
  near(s.objective, 5e-8, "objective");
});

test("a row no variable touches is checked against zero", () => {
  const base = dietModel();
  const ok = solveLp({ ...base, constraints: { ...base.constraints, unused: { max: 5 } } });
  assert.equal(ok.feasible, true);
  const bad = solveLp({ ...base, constraints: { ...base.constraints, unused: { min: 1 } } });
  assert.equal(bad.feasible, false);
  assert.equal(bad.error, undefined);
});

test("the objective may also be a constrained row", () => {
  const s = solveLp({
    optimize: "cost",
    opType: "min",
    constraints: { cost: { min: 6 } },
    variables: { x: { cost: 2 } },
  });
  assert.equal(s.feasible, true);
  near(s.values.x, 3, "x");
  near(s.objective, 6, "objective");
});

test("names never reach the LP text: hostile names solve like plain ones", () => {
  const hostile = ["a b", "x|grupo|protein", "c0", "End", "\nSubject To\n", "obj:", "<= 3", "ñandú ☕", "-1e5"];
  const constraints = {};
  const variables = {};
  hostile.forEach((name, i) => {
    constraints[`row ${name}`] = { min: i + 1 };
    variables[name] = { [`row ${name}`]: 1, "costo total: <=": 1 + i };
  });
  const s = solveLp({ optimize: "costo total: <=", opType: "min", constraints, variables });
  assert.equal(s.feasible, true);
  hostile.forEach((name, i) => near(s.values[name], i + 1, name));
  assert.deepEqual(Object.keys(s.values).sort(), [...hostile].sort());
});

for (const name of ["feasible", "result", "bounded", "Status", "Columns"]) {
  test(`variable name "${name}" works (names are mapped, so no clash with solver fields)`, () => {
    const model = dietModel();
    model.variables[name] = { cost: 0.01, protein: 1, carbs: 1 };
    const s = solveLp(model);
    assert.equal(s.feasible, true);
    near(s.values[name], 3, name);
  });
}

test("cpuMs is measured with the injected clock", () => {
  let t = 100;
  const s = solveLp(dietModel(), () => (t += 7));
  assert.equal(s.cpuMs, 7);
});

test("a 300-variable, 400-row model solves in under 150 ms", () => {
  const s = solveLp(syntheticModel(300, 400));
  assert.ok(s.feasible);
  assert.ok(s.cpuMs < 150, `${s.cpuMs}`);
});

const invalidModels = {
  "null model": () => null,
  "opType other than min": () => ({ ...dietModel(), opType: "max" }),
  "empty optimize": () => ({ ...dietModel(), optimize: "" }),
  "non-finite coefficient": () => {
    const m = dietModel();
    m.variables.a.protein = Number.NaN;
    return m;
  },
  "string coefficient": () => {
    const m = dietModel();
    m.variables.a.protein = "1";
    return m;
  },
  "coefficient beyond LP_MAX_ABS_VALUE": () => {
    const m = dietModel();
    m.variables.a.protein = LP_MAX_ABS_VALUE * 10;
    return m;
  },
  "bound beyond LP_MAX_ABS_VALUE": () => ({ ...dietModel(), constraints: { protein: { max: -LP_MAX_ABS_VALUE * 10 } } }),
  "constraint without bounds": () => ({ ...dietModel(), constraints: { protein: {} } }),
  "constraint with min above max": () => ({ ...dietModel(), constraints: { protein: { min: 5, max: 1 } } }),
  "non-finite bound": () => ({ ...dietModel(), constraints: { protein: { min: Number.POSITIVE_INFINITY } } }),
  "__proto__ as a variable name": () => {
    const m = dietModel();
    m.variables = JSON.parse('{"__proto__": {"cost": 1}, "a": {"cost": 1}}');
    return m;
  },
  "variables not an object": () => ({ ...dietModel(), variables: [] }),
  "too many variables": () => syntheticModel(LP_MAX_VARIABLES + 1, 10),
  "too many constraints": () => syntheticModel(10, LP_MAX_CONSTRAINTS + 1),
};

for (const [label, build] of Object.entries(invalidModels)) {
  test(`invalid model is rejected without throwing: ${label}`, () => {
    const s = solveLp(build());
    assert.equal(s.feasible, false);
    assert.equal(s.error, "invalid_model");
    assert.deepEqual(s.values, {});
  });
}

test("the caller's model is not mutated", () => {
  const model = dietModel();
  const before = JSON.stringify(model);
  solveLp(model);
  assert.equal(JSON.stringify(model), before);
});

// --- reading the solver answer -----------------------------------------------

test("readSolverResult rejects malformed answers", () => {
  for (const raw of [null, 3, {}, { Status: 7 }, { Status: "Optimal", ObjectiveValue: "1", Columns: {} },
    { Status: "Optimal", ObjectiveValue: 1, Columns: null },
    { Status: "Optimal", ObjectiveValue: 1, Columns: { x0: { Primal: Number.NaN } } },
    { Status: "Optimal", ObjectiveValue: Number.POSITIVE_INFINITY, Columns: {} }]) {
    assert.deepEqual(readSolverResult(raw, 1), { kind: "invalid" }, JSON.stringify(raw));
  }
});

test("readSolverResult maps limits and native errors to error codes", () => {
  assert.deepEqual(readSolverResult({ Status: "Time limit reached", ObjectiveValue: 0, Columns: {} }, 0), { kind: "error", error: "time_limit" });
  assert.deepEqual(readSolverResult({ Status: "Iteration limit reached", ObjectiveValue: 0, Columns: {} }, 0), { kind: "error", error: "time_limit" });
  assert.deepEqual(readSolverResult({ Status: "Solve error", ObjectiveValue: 0, Columns: {} }, 0), { kind: "error", error: "solver_error" });
  assert.deepEqual(readSolverResult({ Status: "Something new", ObjectiveValue: 0, Columns: {} }, 0), { kind: "error", error: "solver_error" });
});

test("readSolverResult reads values by generated column index", () => {
  const r = readSolverResult({ Status: "Optimal", ObjectiveValue: 2, Columns: { x1: { Primal: 2 } } }, 2);
  assert.deepEqual(r, { kind: "optimal", objective: 2, primal: [0, 2] });
});
