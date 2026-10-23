import type { GenerationErrorCode } from "./errors.ts";

/**
 * Thin wrapper around OpenAI Chat Completions with structured (JSON schema)
 * output. The model is configurable with the OPENAI_MODEL secret so it can be
 * changed (or upgraded) without a code change.
 */
const DEFAULT_MODEL = "gpt-4o";
const OPENAI_TIMEOUT_MS = 60_000;

export interface ModelRequest {
  system: string;
  user: string;
  /** OpenAI `response_format` object (json_schema, strict). */
  responseFormat: unknown;
}

export interface ModelResponse {
  content: string | null;
  error: string | null;
  errorCode: GenerationErrorCode | null;
}

export type ModelCall = (request: ModelRequest) => Promise<ModelResponse>;

function failure(
  error: string,
  errorCode: GenerationErrorCode,
): ModelResponse {
  return { content: null, error, errorCode };
}

/** Builds a caller for the given credentials (used by the function and by the offline evaluation script). */
export function createOpenAICaller(config: {
  apiKey: string | undefined;
  model?: string;
}): ModelCall {
  return async (request) => {
    if (!config.apiKey) {
      return failure(
        "El servicio de generación no está configurado.",
        "server_config",
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.model || DEFAULT_MODEL,
            temperature: 0.6,
            max_completion_tokens: 6000,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.user },
            ],
            response_format: request.responseFormat,
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        if (response.status === 429) {
          return failure(
            "Demasiadas solicitudes. Espera un momento e intenta de nuevo.",
            "rate_limited",
          );
        }

        return failure(
          "No pudimos generar tu plan. Intenta de nuevo en unos segundos.",
          "ai_unavailable",
        );
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;

      if (typeof content !== "string" || !content.trim()) {
        return failure(
          "La respuesta del servicio de IA estaba vacía.",
          "ai_empty",
        );
      }

      return { content, error: null, errorCode: null };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return failure(
          "La generación tardó demasiado. Intenta de nuevo.",
          "ai_timeout",
        );
      }

      return failure(
        "No pudimos conectar con el servicio de IA. Intenta de nuevo.",
        "ai_unavailable",
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/** The caller used inside the Edge Function (secrets come from Deno.env). */
export const callOpenAI: ModelCall = (request) =>
  createOpenAICaller({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
    model: Deno.env.get("OPENAI_MODEL") || undefined,
  })(request);
