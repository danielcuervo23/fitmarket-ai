import { bogotaToday } from "./catalogLoader.ts";
import { logEvent } from "./log.ts";
import type { BuiltPlan } from "./planner/build.ts";
import { planFromPartial, type GenerateInput, type PartialWeek, type PlannerDeps } from "./planner/generate.ts";
import { RECIPE_LIBRARY_VERSION } from "./recipes/library.generated.ts";
import { DEFAULT_COOKING } from "./recipes/types.ts";

/**
 * "Quiero el plan igual" reuses the week of the request that answered
 * goals_unreachable (owner decision 2026-11-11): no second OpenAI call and no
 * second daily try. The week is kept in `partial_plan_results` (migration 016):
 * one row per user, written only by the service role, read and deleted by the
 * user's own JWT client (RLS: own row only), valid for PARTIAL_PLAN_TTL_MS
 * and only for the exact same generation inputs (the fingerprint).
 */

/**
 * 30 minutes: long enough to read the conflicts and decide, short enough that
 * the stored week matches today's prices (the catalog cache refreshes every
 * 10 minutes and the fingerprint already changes with the Bogotá day) and the
 * data does not linger.
 */
export const PARTIAL_PLAN_TTL_MS = 30 * 60_000;
/** A real week is ~6–10 KB of JSON; the table has the same cap (migration 016). */
export const MAX_PARTIAL_WEEK_CHARS = 32_768;
/** Longest wait for either query; after it the request goes on without reuse. */
export const PARTIAL_PLAN_TIMEOUT_MS = 3_000;
/** Bump when the fingerprint's contents change, so old rows never match. */
const FINGERPRINT_VERSION = 1;

const FINGERPRINT = /^[0-9a-f]{64}$/;
const TABLE = "partial_plan_results";
/** Postgres / PostgREST codes only; anything else is logged as unknown. */
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/;

/** What identifies "the same request": everything the plan depends on. */
export type FingerprintInput = GenerateInput & { city: string | null };

const sorted = (list: readonly string[] | undefined): string[] => [...new Set(list ?? [])].sort();

/**
 * SHA-256 (hex) of the generation inputs in a fixed order: budget, goals,
 * stores, restrictions, household, body profile, cooking, health, city, the
 * recipe library version and the price date (Bogotá day of `nowMs`).
 * `allowPartial` is left out on purpose: it is what the retry changes.
 */
export async function generationFingerprint(
  request: FingerprintInput,
  nowMs: number,
  libraryVersion: string = RECIPE_LIBRARY_VERSION,
): Promise<string> {
  const cooking = request.cooking ?? DEFAULT_COOKING;
  const { age, weightKg, heightCm, activity, sex } = request.profile;
  const canonical = JSON.stringify([
    FINGERPRINT_VERSION,
    request.weeklyBudgetCop,
    sorted(request.goals),
    sorted(request.stores),
    sorted(request.restrictions),
    request.householdSize,
    [age, weightKg, heightCm, activity, sex ?? null],
    [cooking.weekdayMinutes, cooking.level, sorted(cooking.appliances), cooking.batch],
    sorted(request.health),
    request.city,
    libraryVersion,
    bogotaToday(nowMs),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

type Result<T> = PromiseLike<{ data?: T | null; error: { code?: string } | null }>;

/** The part of a Supabase client these functions use (a test can fake it). */
export interface PartialPlanClient {
  from(table: "partial_plan_results"): {
    upsert(
      row: { user_id: string; fingerprint: string; week: unknown; expires_at: string },
      options: { onConflict: "user_id" },
    ): { abortSignal(signal: AbortSignal): Result<unknown> };
    delete(): PartialPlanDelete;
    select(columns: "week"): PartialPlanSelect;
  };
}

interface PartialPlanSelect {
  eq(column: "user_id" | "fingerprint", value: string): PartialPlanSelect;
  gt(column: "expires_at", value: string): PartialPlanSelect;
  abortSignal(signal: AbortSignal): Result<{ week?: unknown }[]>;
}

interface PartialPlanDelete {
  eq(column: "user_id" | "fingerprint", value: string): PartialPlanDelete;
  gt(column: "expires_at", value: string): PartialPlanDelete;
  select(columns: "week"): { abortSignal(signal: AbortSignal): Result<{ week?: unknown }[]> };
}

const codeOf = (error: { code?: string }, aborted: boolean): string =>
  aborted ? "timeout" : typeof error.code === "string" && SAFE_CODE.test(error.code) ? error.code : "unknown";

/**
 * Keeps the week of a goals_unreachable answer for PARTIAL_PLAN_TTL_MS,
 * replacing any earlier one of the same user. `client` is the service role
 * client (users cannot write this table), `userId` comes from the verified
 * JWT. Never throws; false when nothing was stored.
 */
export async function storePartialWeek(
  client: PartialPlanClient | null,
  userId: string,
  fingerprint: string,
  partial: PartialWeek,
  nowMs: number,
): Promise<boolean> {
  if (!client) {
    logEvent("partial_plan_store_failed", { code: "no_service_key" });
    return false;
  }
  if (!FINGERPRINT.test(fingerprint) || JSON.stringify(partial.week).length > MAX_PARTIAL_WEEK_CHARS) {
    logEvent("partial_plan_store_failed", { code: "invalid" });
    return false;
  }

  const signal = AbortSignal.timeout(PARTIAL_PLAN_TIMEOUT_MS);
  try {
    const { error } = await client
      .from(TABLE)
      .upsert(
        { user_id: userId, fingerprint, week: partial.week, expires_at: new Date(nowMs + PARTIAL_PLAN_TTL_MS).toISOString() },
        { onConflict: "user_id" },
      )
      .abortSignal(signal);
    if (error) {
      logEvent("partial_plan_store_failed", { code: codeOf(error, signal.aborted) });
      return false;
    }
    return true;
  } catch {
    logEvent("partial_plan_store_failed", { code: signal.aborted ? "timeout" : "exception" });
    return false;
  }
}

/**
 * Reads, without deleting, the user's stored week when it has this
 * fingerprint and has not expired. `client` is the caller's own JWT client
 * (RLS: own row only). Null when there is nothing to reuse; never throws.
 */
export async function readPartialWeek(
  client: PartialPlanClient,
  userId: string,
  fingerprint: string,
  nowMs: number,
): Promise<PartialWeek | null> {
  if (!FINGERPRINT.test(fingerprint)) return null;

  const signal = AbortSignal.timeout(PARTIAL_PLAN_TIMEOUT_MS);
  try {
    const { data, error } = await client
      .from(TABLE)
      .select("week")
      .eq("user_id", userId)
      .eq("fingerprint", fingerprint)
      .gt("expires_at", new Date(nowMs).toISOString())
      .abortSignal(signal);
    if (error) {
      logEvent("partial_plan_read_failed", { code: codeOf(error, signal.aborted) });
      return null;
    }
    const week = Array.isArray(data) ? data[0]?.week : undefined;
    return week === undefined || week === null ? null : { week: week as PartialWeek["week"] };
  } catch {
    logEvent("partial_plan_read_failed", { code: signal.aborted ? "timeout" : "exception" });
    return null;
  }
}

/**
 * Takes (reads and deletes, in one statement) the user's stored week when it
 * has this fingerprint and has not expired, after it was validated: single use, so two parallel
 * retries cannot both get it. `client` is the caller's own JWT client (RLS:
 * own row only). Null when there is nothing to reuse; never throws.
 */
export async function takePartialWeek(
  client: PartialPlanClient,
  userId: string,
  fingerprint: string,
  nowMs: number,
): Promise<PartialWeek | null> {
  if (!FINGERPRINT.test(fingerprint)) return null;

  const signal = AbortSignal.timeout(PARTIAL_PLAN_TIMEOUT_MS);
  try {
    const { data, error } = await client
      .from(TABLE)
      .delete()
      .eq("user_id", userId)
      .eq("fingerprint", fingerprint)
      .gt("expires_at", new Date(nowMs).toISOString())
      .select("week")
      .abortSignal(signal);
    if (error) {
      logEvent("partial_plan_take_failed", { code: codeOf(error, signal.aborted) });
      return null;
    }
    const week = Array.isArray(data) ? data[0]?.week : undefined;
    return week === undefined || week === null ? null : { week: week as PartialWeek["week"] };
  } catch {
    logEvent("partial_plan_take_failed", { code: signal.aborted ? "timeout" : "exception" });
    return null;
  }
}

export interface ReuseRequest {
  /** The request as built from the database (never from the body). */
  request: FingerprintInput;
  /** From the parsed body: only `true` asks for reuse. */
  allowPartial: boolean;
  /** From the verified JWT. */
  userId: string;
  /** The caller's own JWT client. */
  client: PartialPlanClient;
  nowMs: number;
  /** Catalog and prices, loaded only when a week was found. */
  deps: PlannerDeps | (() => Promise<PlannerDeps>);
}

/**
 * "Quiero el plan igual" with the week of an earlier goals_unreachable answer
 * for the same inputs: the partial plan, or null when the request did not ask
 * for it, nothing matching is stored, or the stored week no longer passes the
 * checks of `planFromPartial` (then the caller generates normally, which uses
 * a daily try like any fresh generation).
 */
export async function reusePartialPlan(reuse: ReuseRequest): Promise<BuiltPlan | null> {
  if (!reuse.allowPartial) return null;

  const fingerprint = await generationFingerprint(reuse.request, reuse.nowMs);
  // Validate first, delete only on success: a week that fails the checks is
  // not burned (it simply expires), and the caller generates normally.
  const stored = await readPartialWeek(reuse.client, reuse.userId, fingerprint, reuse.nowMs);
  if (!stored) return null;

  const deps = typeof reuse.deps === "function" ? await reuse.deps() : reuse.deps;
  const plan = planFromPartial({ ...reuse.request, allowPartial: true }, stored, deps);
  if (!plan) {
    logEvent("partial_plan_reuse_rejected");
    return null;
  }

  // Single use: only the request whose delete returns the row may deliver it,
  // so two parallel retries cannot both get a plan from one try.
  const taken = await takePartialWeek(reuse.client, reuse.userId, fingerprint, reuse.nowMs);
  if (!taken) {
    logEvent("partial_plan_reuse_lost");
    return null;
  }
  logEvent("partial_plan_reused");
  return plan;
}

/** Longest the answer waits for background work when the runtime cannot keep it alive. */
export const BACKGROUND_FALLBACK_MS = 1500;

interface BackgroundRuntime {
  EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
}

/**
 * Lets work that the user does not wait for (keeping the week for "Quiero el
 * plan igual") finish after the answer. On Supabase Edge Functions
 * `EdgeRuntime.waitUntil` keeps the instance alive and the answer leaves at
 * once; elsewhere it waits at most `fallbackMs`. The task must not reject
 * (storePartialWeek never does).
 */
export async function finishInBackground(
  task: Promise<unknown>,
  runtime: BackgroundRuntime = globalThis as BackgroundRuntime,
  fallbackMs: number = BACKGROUND_FALLBACK_MS,
): Promise<void> {
  const waitUntil = runtime.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") {
    waitUntil.call(runtime.EdgeRuntime, task);
    return;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([task, new Promise<void>((resolve) => (timer = setTimeout(resolve, fallbackMs)))]);
  clearTimeout(timer);
}
