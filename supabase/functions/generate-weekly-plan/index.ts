import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildGenerationInputFromDb } from "../_shared/buildGenerationInput.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requestWeeklyPlanFromOpenAI } from "../_shared/openai.ts";
import type { WeeklyPlanPromptInput } from "../_shared/prompts.ts";
import {
  parseWeeklyPlanJson,
  validateWeeklyPlanBusinessRules,
  type WeeklyPlanParsed,
} from "../_shared/weeklyPlanSchema.ts";

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
      supermarkets: input.supermarkets,
    });

    const { plan, error: generationError } = await generateAndValidatePlan(
      input,
    );

    if (generationError) {
      const status = generationError.includes("configurado") ? 503 : 422;
      return jsonResponse({ error: generationError }, status);
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
): Promise<{ plan: WeeklyPlanParsed | null; error: string | null }> {
  let lastError =
    "No pudimos generar un plan válido. Revisa tus preferencias e intenta de nuevo.";

  for (const isRetry of [false, true]) {
    const { content, error: openAiError } = await requestWeeklyPlanFromOpenAI(
      input,
      { isRetry },
    );

    if (openAiError) {
      lastError = openAiError;
      if (openAiError.includes("configurado")) {
        return { plan: null, error: openAiError };
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
      lastError = "El plan generado no tiene un formato válido.";
      continue;
    }

    const { data: plan, error: schemaError } = parseWeeklyPlanJson(parsed);

    if (schemaError || !plan) {
      lastError = schemaError ?? lastError;
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
    });

    if (businessError) {
      console.log({
        source: "generateAndValidatePlan",
        businessError,
        weekly_budget_cop: input.weekly_budget_cop,
      });
      lastError = businessError;
      continue;
    }

    return { plan, error: null };
  }

  return { plan: null, error: lastError };
}
