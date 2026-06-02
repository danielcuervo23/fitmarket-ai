import {
  buildWeeklyPlanUserPrompt,
  buildWeeklyPlanRetryUserContent,
  WEEKLY_PLAN_SYSTEM_PROMPT,
  type WeeklyPlanPromptInput,
} from "./prompts.ts";
import { getOpenAIWeeklyPlanResponseFormat } from "./weeklyPlanSchema.ts";

const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_TIMEOUT_MS = 55_000;

interface OpenAIMessage {
  role: "system" | "user";
  content: string;
}

export async function requestWeeklyPlanFromOpenAI(
  input: WeeklyPlanPromptInput,
  options?: {
    isRetry?: boolean;
    validationError?: string;
    previousInvalidJson?: string;
  },
): Promise<{ content: string | null; error: string | null }> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    return {
      content: null,
      error: "El servicio de generación no está configurado.",
    };
  }

  let userContent = buildWeeklyPlanUserPrompt(input);

  if (options?.isRetry) {
    if (options.validationError && options.previousInvalidJson) {
      userContent += buildWeeklyPlanRetryUserContent(
        options.validationError,
        options.previousInvalidJson,
      );
    } else {
      userContent +=
        "\n\nCorrige el JSON anterior: debe cumplir el schema, respetar el presupuesto, usar solo store_id permitidos, cumplir dietary_restrictions, cumplir goal_guidance y descomponer comidas en ingredientes con cantidades (g, ml o unidades).";
    }
  }

  const messages: OpenAIMessage[] = [
    { role: "system", content: WEEKLY_PLAN_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.5,
        max_tokens: 4096,
        messages,
        response_format: getOpenAIWeeklyPlanResponseFormat(),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const status = response.status;

      if (status === 429) {
        return {
          content: null,
          error: "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
        };
      }

      return {
        content: null,
        error: "No pudimos generar tu plan. Intenta de nuevo en unos segundos.",
      };
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      return {
        content: null,
        error: "La respuesta del servicio de IA estaba vacía.",
      };
    }

    return { content, error: null };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        content: null,
        error: "La generación tardó demasiado. Intenta de nuevo.",
      };
    }

    return {
      content: null,
      error: "No pudimos conectar con el servicio de IA. Intenta de nuevo.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
