import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildGenerationInputFromDb } from "../_shared/buildGenerationInput.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "Debes iniciar sesión para generar tu plan." },
        401,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(
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
      return jsonResponse(
        { error: "Debes iniciar sesión para generar tu plan." },
        401,
      );
    }

    const { data: input, error: inputError } = await buildGenerationInputFromDb(
      supabase,
      user.id,
    );

    if (inputError || !input) {
      return jsonResponse({ error: inputError ?? "Datos incompletos." }, 400);
    }

    // LOG TEMPORAL — presupuesto leído de profiles.weekly_budget_cop
    console.log({
      source: "buildGenerationInputFromDb",
      weekly_budget_cop: input.weekly_budget_cop,
      weekly_budget_cop_type: typeof input.weekly_budget_cop,
      goals: input.goals,
      profile: input.profile,
      supermarkets: input.supermarkets,
    });

    const { plan, error: generationError } = await generateAndValidatePlan(
      input,
    );

    if (generationError) {
      if (generationError.type === "budget_too_low") {
        // 200 para que supabase.functions.invoke entregue el body en `data`
        return jsonResponse(
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
      return jsonResponse({ error: generationError.message }, status);
    }

    if (!plan) {
      return jsonResponse(
        {
          error:
            "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.",
        },
        422,
      );
    }

    return jsonResponse({ plan }, 200);
  } catch {
    return jsonResponse(
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

    console.log({
      source: "generateAndValidatePlan",
      attempt: isRetry ? "retry" : "first",
      weekly_budget_cop: input.weekly_budget_cop,
    });

    const businessError = validateWeeklyPlanBusinessRules(plan, {
      weekly_budget_cop: input.weekly_budget_cop,
      supermarkets: input.supermarkets,
      dietary_restrictions: input.dietary_restrictions,
      goals: input.goals,
    });

    if (businessError) {
      console.log({
        source: "generateAndValidatePlan",
        businessError,
        weekly_budget_cop: input.weekly_budget_cop,
        dietary_restrictions: input.dietary_restrictions,
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
