import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildGenerationInputFromDb } from "../_shared/buildGenerationInput.ts";
import {
  loadPlannerData,
  plannerDeps,
  resolveCacheTtlMs,
  type CatalogClient,
} from "../_shared/catalogLoader.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { logEvent, logUnexpected } from "../_shared/log.ts";
import { callOpenAI } from "../_shared/openai.ts";
import {
  DEFAULT_MAX_MODEL_CALLS,
  DEFAULT_TIME_BUDGET_MS,
  MAX_MODEL_CALLS_CEILING,
  MAX_TIME_BUDGET_MS,
} from "../_shared/planner/callBudget.ts";
import { readGenerationRequestBody } from "../_shared/generationRequest.ts";
import { failureResponse } from "../_shared/generationResponse.ts";
import {
  generationFingerprint,
  reusePartialPlan,
  storePartialWeek,
  type PartialPlanClient,
} from "../_shared/partialPlanStore.ts";
import { generatePlan } from "../_shared/planner/generate.ts";
import { respondWithGeneratedPlan } from "../_shared/planStorage.ts";
import { positiveIntOr, shouldRefund } from "../_shared/quota.ts";
import { parseWeeklyPlanJson } from "../_shared/weeklyPlanSchema.ts";

const DEFAULT_DAILY_GENERATION_LIMIT = 10;

function getDailyGenerationLimit(): number {
  return positiveIntOr(
    Deno.env.get("GENERATION_DAILY_LIMIT"),
    DEFAULT_DAILY_GENERATION_LIMIT,
  );
}

Deno.serve(async (req: Request) => {
  // The time budget counts from arrival, so auth and database reads are included.
  const startedAt = Date.now();
  const json = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(req, body, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(
      { error: "Método no permitido.", code: "method_not_allowed" },
      405,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        {
          error: "Debes iniciar sesión para generar tu plan.",
          code: "unauthorized",
        },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(
        {
          error: "Configuración del servidor incompleta.",
          code: "server_config",
        },
        500,
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return json(
        {
          error: "Debes iniciar sesión para generar tu plan.",
          code: "unauthorized",
        },
        401,
      );
    }

    // Read before any quota write. Capped at MAX_BODY_CHARS; anything invalid
    // (or the `{}` the old web sends) gives the defaults. Only the version is
    // logged, never the body.
    const requestBody = await readGenerationRequestBody(req);
    logEvent("client_version", { version: requestBody.appVersion ?? "none" });

    const { data: input, error: inputError } = await buildGenerationInputFromDb(
      supabase,
      user.id,
    );

    if (inputError || !input) {
      return json(
        {
          error: inputError?.message ?? "Datos incompletos.",
          code: inputError?.code ?? "profile_incomplete",
        },
        400,
      );
    }

    // Catalog and city prices, read with the caller's own client (never the
    // service role). Any problem falls back to the built-in data. Loaded at
    // most once per request, only when needed.
    const loadDeps = async () => {
      const plannerData = await loadPlannerData(supabase as unknown as CatalogClient, input.city, {
        ttlMs: resolveCacheTtlMs(Deno.env.get("CATALOG_CACHE_TTL_MS")),
      });
      logEvent("catalog_origin", { origin: plannerData.origin });
      return plannerDeps(plannerData);
    };
    let depsPromise: ReturnType<typeof loadDeps> | null = null;
    const deps = () => (depsPromise ??= loadDeps());

    // Service role client, or null when the key is not configured. Used for
    // writes the user must not control: the refund, saving the plan and
    // keeping the week for "Quiero el plan igual".
    const createServiceClient = () => {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      return serviceKey
        ? createClient(supabaseUrl, serviceKey, {
            // A per-request server client: no session to keep or refresh.
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
    };

    // "Quiero el plan igual" right after a goals_unreachable answer with the
    // same inputs: the week already computed (and paid for with that request's
    // daily try) is taken (single use) and delivered. No OpenAI call and no
    // quota row: it is not a new generation. Different inputs, nothing stored
    // or an expired week fall through to a normal generation below.
    const reused = await reusePartialPlan({
      request: input,
      allowPartial: requestBody.allowPartial,
      userId: user.id,
      client: supabase as unknown as PartialPlanClient,
      nowMs: Date.now(),
      deps,
    });

    if (reused) {
      const { status, body } = await respondWithGeneratedPlan(reused, {
        parse: parseWeeklyPlanJson,
        client: createServiceClient(),
        userId: user.id,
      });
      return json(body, status);
    }

    // Per-user daily quota: protects the OpenAI bill from abuse. The request is
    // recorded first, then counted, so concurrent calls cannot skip the limit.
    const { data: recorded, error: recordError } = await supabase
      .from("plan_generation_requests")
      .insert({ user_id: user.id })
      .select("id")
      .single();

    if (recordError) {
      logEvent("generation_quota_record_failed", {
        code: recordError.code ?? "",
      });
      return json(
        {
          error: "No pudimos iniciar la generación. Intenta de nuevo.",
          code: "unexpected",
        },
        500,
      );
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from("plan_generation_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);

    if (countError) {
      logEvent("generation_quota_count_failed", {
        code: countError.code ?? "",
      });
      return json(
        {
          error: "No pudimos iniciar la generación. Intenta de nuevo.",
          code: "unexpected",
        },
        500,
      );
    }

    if ((count ?? 0) > getDailyGenerationLimit()) {
      logEvent("generation_quota_exceeded");
      return json(
        {
          error:
            "Alcanzaste el límite diario de planes generados. Intenta de nuevo mañana.",
          code: "quota_exceeded",
        },
        429,
      );
    }

    // "Quiero el plan igual" travels with the input (it relaxes only level 2-5 rules).
    const generationInput = { ...input, allowPartial: requestBody.allowPartial };

    const outcome = await generatePlan(generationInput, callOpenAI, {
      maxModelCalls: positiveIntOr(
        Deno.env.get("GENERATION_MAX_MODEL_CALLS"),
        DEFAULT_MAX_MODEL_CALLS,
        MAX_MODEL_CALLS_CEILING,
      ),
      deadline:
        startedAt +
        positiveIntOr(
          Deno.env.get("GENERATION_TIME_BUDGET_MS"),
          DEFAULT_TIME_BUDGET_MS,
          MAX_TIME_BUDGET_MS,
        ),
    }, await deps());

    // A try that failed because of us gives the user their try back. Users
    // cannot delete their own rows (so they cannot reset the counter), which
    // is why this uses the service role.
    const refund = async () => {
      const serviceClient = createServiceClient();

      if (!serviceClient || !recorded?.id) {
        return;
      }

      const { error } = await serviceClient
        .from("plan_generation_requests")
        .delete()
        .eq("id", recorded.id);

      if (error) {
        logEvent("generation_quota_refund_failed", { code: error.code ?? "" });
      }
    };

    if ("plan" in outcome) {
      // Checked with the shared schema, then saved here so a network drop
      // after generation does not lose a plan already paid for. user_id comes
      // from the verified JWT only. An invalid plan is not saved and answers
      // invalid_format (422), never refunded: its calls were billed. If the
      // save fails the response still carries the plan, without planId, and
      // the browser saves it as before.
      const { status, body } = await respondWithGeneratedPlan(outcome.plan, {
        parse: parseWeeklyPlanJson,
        client: createServiceClient(),
        userId: user.id,
      });

      return json(body, status);
    }

    // Keep the week so "Quiero el plan igual" with the same inputs reuses it.
    if (outcome.error.code === "goals_unreachable" && outcome.reusable) {
      // The price date of the fingerprint is the one this request started on.
      await storePartialWeek(
        createServiceClient() as unknown as PartialPlanClient | null,
        user.id,
        await generationFingerprint(input, startedAt),
        outcome.reusable,
        Date.now(),
      );
    }

    if (shouldRefund(outcome.error.code, outcome.usage, outcome.refundable === true)) {
      await refund();
    }

    const { status, payload } = failureResponse(outcome.error, requestBody);
    return json(payload, status);
  } catch (error) {
    logUnexpected("generate-weekly-plan", error);
    return json(
      { error: "Error inesperado al generar tu plan.", code: "unexpected" },
      500,
    );
  }
});
