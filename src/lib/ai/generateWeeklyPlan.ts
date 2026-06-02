import { parseWeeklyPlanJson } from "@/lib/ai/weeklyPlanSchema";
import type { WeeklyPlan } from "@/lib/ai/types";
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

export interface BudgetTooLowGenerationError {
  kind: "budget_too_low";
  currentBudget: number;
  requiredBudget: number;
  recommendedIncrease: number;
}

export interface MessageGenerationError {
  kind: "message";
  message: string;
}

export type GenerateWeeklyPlanError =
  | BudgetTooLowGenerationError
  | MessageGenerationError;

type GenerateWeeklyPlanResponse = {
  plan?: unknown;
  error?: string;
  currentBudget?: number;
  requiredBudget?: number;
  recommendedIncrease?: number;
  current_budget?: number;
  required_budget?: number;
  recommended_increase?: number;
};

const BUDGET_ERROR_MESSAGE =
  "La lista de mercado supera tu presupuesto semanal.";

function getFallbackInvokeErrorMessage(): string {
  return "No pudimos generar tu plan. Intenta de nuevo en unos segundos.";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseGenerationErrorBody(
  body: unknown,
): GenerateWeeklyPlanError | null {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as GenerateWeeklyPlanResponse;

  if (record.error === "budget_too_low") {
    const currentBudget =
      readNumber(record.currentBudget) ?? readNumber(record.current_budget);
    const requiredBudget =
      readNumber(record.requiredBudget) ?? readNumber(record.required_budget);
    const recommendedIncrease =
      readNumber(record.recommendedIncrease) ??
      readNumber(record.recommended_increase);

    if (
      currentBudget !== null &&
      requiredBudget !== null &&
      recommendedIncrease !== null
    ) {
      return {
        kind: "budget_too_low",
        currentBudget,
        requiredBudget,
        recommendedIncrease,
      };
    }
  }

  if (typeof record.error === "string" && record.error.trim()) {
    if (record.error === "budget_too_low") {
      return {
        kind: "message",
        message:
          "No fue posible generar un plan con tu presupuesto actual. Ajusta tu presupuesto e intenta de nuevo.",
      };
    }

    return { kind: "message", message: record.error };
  }

  return null;
}

async function readFunctionsHttpErrorBody(
  error: FunctionsHttpError,
): Promise<unknown> {
  const { context } = error;

  if (!(context instanceof Response)) {
    return null;
  }

  try {
    return await context.clone().json();
  } catch {
    try {
      return await context.json();
    } catch {
      return null;
    }
  }
}

async function extractInvokeResponseBody(
  payload: unknown,
  invokeError: unknown,
): Promise<unknown> {
  const parsedFromPayload = parseGenerationErrorBody(payload);

  if (parsedFromPayload) {
    return payload;
  }

  if (payload && typeof payload === "object") {
    return payload;
  }

  if (invokeError instanceof FunctionsHttpError) {
    const body = await readFunctionsHttpErrorBody(invokeError);

    if (body) {
      return body;
    }
  }

  if (
    invokeError &&
    typeof invokeError === "object" &&
    "context" in invokeError &&
    (invokeError as { context: unknown }).context instanceof Response
  ) {
    try {
      return await (
        (invokeError as { context: Response }).context as Response
      ).clone().json();
    } catch {
      return null;
    }
  }

  return null;
}

async function getInvokeErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await readFunctionsHttpErrorBody(error);
    const parsed = parseGenerationErrorBody(body);

    if (parsed?.kind === "message") {
      return parsed.message;
    }
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes("network") || message.includes("fetch")) {
    return "No pudimos conectar. Revisa tu internet e intenta de nuevo.";
  }

  return getFallbackInvokeErrorMessage();
}

export function generationErrorToMessage(
  error: GenerateWeeklyPlanError,
): string {
  if (error.kind === "budget_too_low") {
    return "No fue posible generar un plan con tu presupuesto actual.";
  }

  return error.message;
}

export async function generateWeeklyPlan(): Promise<{
  data: WeeklyPlan | null;
  error: GenerateWeeklyPlanError | null;
}> {
  const { data: payload, error: invokeError } =
    await supabase.functions.invoke<GenerateWeeklyPlanResponse>(
      "generate-weekly-plan",
      { body: {} },
    );

  const responseBody = await extractInvokeResponseBody(payload, invokeError);
  const parsedError = parseGenerationErrorBody(responseBody);

  if (parsedError) {
    return { data: null, error: parsedError };
  }

  if (invokeError) {
    console.error("[FitMarket] generate-weekly-plan invoke:", invokeError);

    return {
      data: null,
      error: {
        kind: "message",
        message: await getInvokeErrorMessage(invokeError),
      },
    };
  }

  const response = (responseBody ?? payload) as GenerateWeeklyPlanResponse | null;

  if (!response?.plan) {
    return {
      data: null,
      error: { kind: "message", message: getFallbackInvokeErrorMessage() },
    };
  }

  const { data: plan, error: parseError } = parseWeeklyPlanJson(response.plan);

  if (parseError || !plan) {
    return {
      data: null,
      error: {
        kind: "message",
        message: parseError ?? "El plan generado no tiene un formato válido.",
      },
    };
  }

  return { data: plan as WeeklyPlan, error: null };
}

export { BUDGET_ERROR_MESSAGE };
