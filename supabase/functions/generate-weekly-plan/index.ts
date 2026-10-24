import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildGenerationInputFromDb } from "../_shared/buildGenerationInput.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { logEvent } from "../_shared/log.ts";
import { callOpenAI } from "../_shared/openai.ts";
import { generatePlan } from "../_shared/planner/generate.ts";

const DEFAULT_DAILY_GENERATION_LIMIT = 10;

/** Failures that are ours (not the user's), so they must not use up a daily try. */
const REFUNDED_CODES = new Set([
  "invalid_format",
  "goal_incoherent",
  "generation_failed",
  "ai_unavailable",
  "ai_timeout",
  "ai_empty",
  "rate_limited",
  "server_config",
]);

function getDailyGenerationLimit(): number {
  const configured = Number(Deno.env.get("GENERATION_DAILY_LIMIT"));

  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_DAILY_GENERATION_LIMIT;
}

Deno.serve(async (req: Request) => {
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

    const outcome = await generatePlan(input, callOpenAI);

    // A try that failed because of us gives the user their try back. Users
    // cannot delete their own rows (so they cannot reset the counter), which
    // is why this uses the service role.
    const refund = async () => {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!serviceKey || !recorded?.id) {
        return;
      }

      const { error } = await createClient(supabaseUrl, serviceKey)
        .from("plan_generation_requests")
        .delete()
        .eq("id", recorded.id);

      if (error) {
        logEvent("generation_quota_refund_failed", { code: error.code ?? "" });
      }
    };

    if ("plan" in outcome) {
      return json({ plan: outcome.plan }, 200);
    }

    const { code, message, budget, diagnostics } = outcome.error;

    if (REFUNDED_CODES.has(code)) {
      await refund();
    }

    if (code === "budget_too_low" && budget) {
      // 200 so supabase.functions.invoke delivers the body in `data`.
      return json({ error: "budget_too_low", code, ...budget }, 200);
    }

    const status =
      code === "server_config" ? 503 : code === "rate_limited" ? 429 : 422;

    return json({ error: message, code, diagnostics }, status);
  } catch {
    return json(
      { error: "Error inesperado al generar tu plan.", code: "unexpected" },
      500,
    );
  }
});
