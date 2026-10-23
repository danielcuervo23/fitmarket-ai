import type { GenerationErrorCode } from "./errors.ts";

interface PostgrestLikeError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export interface GenerationInputError {
  code: GenerationErrorCode;
  /** Spanish fallback text; clients translate by `code`. */
  message: string;
}

export function mapGenerationInputLoadError(
  error: PostgrestLikeError,
  source: "profiles" | "user_goals" | "user_supermarkets",
): GenerationInputError {
  const message = error.message.toLowerCase();
  const code = error.code ?? "";

  console.error("[buildGenerationInputFromDb] load failed", {
    source,
    code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });

  if (code === "42501" || message.includes("row-level security")) {
    return {
      code: "permission_denied",
      message:
        "No tienes permiso para generar tu plan. Inicia sesión e intenta de nuevo.",
    };
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout")
  ) {
    return {
      code: "network",
      message: "No pudimos conectar. Revisa tu internet e intenta de nuevo.",
    };
  }

  if (
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  ) {
    return {
      code: "server_config",
      message:
        "Hay un problema de configuración en el servidor. Intenta más tarde o contacta soporte.",
    };
  }

  if (code === "PGRST116" || message.includes("0 rows")) {
    return {
      code: "profile_incomplete",
      message:
        source === "profiles"
          ? "Completa tu perfil (edad, peso, altura y actividad) antes de generar tu plan."
          : "Completa tu configuración en la app antes de generar tu plan.",
    };
  }

  return {
    code: "load_failed",
    message:
      "No pudimos leer tu configuración. Intenta de nuevo en unos segundos.",
  };
}
