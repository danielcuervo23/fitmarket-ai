import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

type GenerateWeeklyPlanResponse = {
  plan?: unknown;
  error?: string;
};

function getFallbackInvokeErrorMessage(): string {
  return "No pudimos generar tu plan. Intenta de nuevo en unos segundos.";
}

async function getInvokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: string };

      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      // Usar mensaje genérico si el cuerpo no es JSON legible.
    }
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return getFallbackInvokeErrorMessage();
}

export async function generateWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: string | null;
}> {
  const { data: payload, error: invokeError } =
    await supabase.functions.invoke<GenerateWeeklyPlanResponse>(
      "generate-weekly-plan",
      { body: {} },
    );

  if (invokeError) {
    return {
      data: null,
      error: await getInvokeErrorMessage(invokeError),
    };
  }

  if (payload?.error) {
    return { data: null, error: payload.error };
  }

  if (!payload?.plan) {
    return { data: null, error: getFallbackInvokeErrorMessage() };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(payload.plan);

  if (parseError || !plan) {
    return {
      data: null,
      error: parseError ?? "El plan generado no tiene un formato válido.",
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}
