import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildGenerationInputFromDb } from "../_shared/buildGenerationInput.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { logEvent } from "../_shared/log.ts";
import { requestWeeklyPlanFromOpenAI } from "../_shared/openai.ts";
import type { WeeklyPlanPromptInput } from "../_shared/prompts.ts";
import {
  parseWeeklyPlanJson,
  validateWeeklyPlanBusinessRules,
  validationErrorToMessage,
  type WeeklyPlanParsed,
  type WeeklyPlanValidationError,
} from "../_shared/weeklyPlanSchema.ts";

type PlanGenerationError =
  | {
      type: "budget_too_low";
      currentBudget: number;
      requiredBudget: number;
      recommendedIncrease: number;
    }
  | { type: "message"; message: string };

function toPlanGenerationError(
  error: WeeklyPlanValidationError,
): PlanGenerationError {
  if (error.code === "budget_too_low") {
    return {
      type: "budget_too_low",
      currentBudget: error.currentBudget,
      requiredBudget: error.requiredBudget,
      recommendedIncrease: error.recommendedIncrease,
    };
  }

  return { type: "message", message: error.message };
}

const DEFAULT_DAILY_GENERATION_LIMIT = 10;

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
    return json({ error: "Método no permitido." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json(
        { error: "Debes iniciar sesión para generar tu plan." },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return json(
        { error: "Configuración del servidor incompleta." },
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
        { error: "Debes iniciar sesión para generar tu plan." },
        401,
      );
    }

    const { data: input, error: inputError } = await buildGenerationInputFromDb(
      supabase,
      user.id,
    );

    if (inputError || !input) {
      return json({ error: inputError ?? "Datos incompletos." }, 400);
    }

    // Per-user daily quota: protects the OpenAI bill from abuse. The request is
    // recorded first, then counted, so concurrent calls cannot skip the limit.
    const { error: recordError } = await supabase
      .from("plan_generation_requests")
      .insert({ user_id: user.id });

    if (recordError) {
      logEvent("generation_quota_record_failed", {
        code: recordError.code ?? "",
      });
      return json(
        { error: "No pudimos iniciar la generación. Intenta de nuevo." },
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
        { error: "No pudimos iniciar la generación. Intenta de nuevo." },
        500,
      );
    }

    if ((count ?? 0) > getDailyGenerationLimit()) {
      logEvent("generation_quota_exceeded");
      return json(
        {
          error:
            "Alcanzaste el límite diario de planes generados. Intenta de nuevo mañana.",
        },
        429,
      );
    }

    const { plan, error: generationError } = await generateAndValidatePlan(
      input,
    );

    if (generationError) {
      if (generationError.type === "budget_too_low") {
        // 200 para que supabase.functions.invoke entregue el body en `data`
        return json(
          {
            error: "budget_too_low",
            currentBudget: generationError.currentBudget,
            requiredBudget: generationError.requiredBudget,
            recommendedIncrease: generationError.recommendedIncrease,
          },
          200,
        );
      }

      const status = generationError.message.includes("configurado") ? 503 : 422;
      return json({ error: generationError.message }, status);
    }

    if (!plan) {
      return json(
        {
          error:
            "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",
        },
        422,
      );
    }

    return json({ plan }, 200);
  } catch {
    return json(
      { error: "Error inesperado al generar tu plan." },
      500,
    );
  }
});

async function generateAndValidatePlan(
  input: WeeklyPlanPromptInput,
): Promise<{ plan: WeeklyPlanParsed | null; error: PlanGenerationError | null }> {
  let lastError: PlanGenerationError = {
    type: "message",
    message:
      "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",
  };
  let lastInvalidContent: string | null = null;

  for (const isRetry of [false, true]) {
    const { content, error: openAiError } = await requestWeeklyPlanFromOpenAI(
      input,
      isRetry
        ? {
            isRetry: true,
            ...(lastInvalidContent
              ? {
                  validationError:
                    lastError.type === "message"
                      ? lastError.message
                      : validationErrorToMessage({
                          code: "budget_too_low",
                          currentBudget: lastError.currentBudget,
                          requiredBudget: lastError.requiredBudget,
                          recommendedIncrease: lastError.recommendedIncrease,
                        }),
                  previousInvalidJson: lastInvalidContent,
                }
              : {}),
          }
        : undefined,
    );

    if (openAiError) {
      lastError = { type: "message", message: openAiError };
      if (openAiError.includes("configurado")) {
        return { plan: null, error: lastError };
      }
      continue;
    }

    if (!content) {
      continue;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch {
      lastError = {
        type: "message",
        message: "El plan generado no tiene un formato válido.",
      };
      lastInvalidContent = content;
      continue;
    }

    const { data: plan, error: schemaError } = parseWeeklyPlanJson(parsed);

    if (schemaError || !plan) {
      lastError = {
        type: "message",
        message: schemaError ?? lastError.message,
      };
      lastInvalidContent = content;
      continue;
    }

    const businessError = validateWeeklyPlanBusinessRules(plan, {
      weekly_budget_cop: input.weekly_budget_cop,
      supermarkets: input.supermarkets,
      dietary_restrictions: input.dietary_restrictions,
      goals: input.goals,
    });

    if (businessError) {
      logEvent("plan_attempt_rejected", {
        attempt: isRetry ? "retry" : "first",
        code: businessError.code,
      });
      const planError = toPlanGenerationError(businessError);
      lastError = planError;
      lastInvalidContent = content;
      continue;
    }

    return { plan, error: null };
  }

  return {
    plan: null,
    error: lastError,
  };
}
