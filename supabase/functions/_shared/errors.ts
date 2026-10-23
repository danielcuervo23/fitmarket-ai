/**
 * Stable machine-readable error codes returned by the generate-weekly-plan
 * function. The client translates each code into the user's language, so the
 * Spanish `error` string in responses is only a fallback for debugging.
 */
export type GenerationErrorCode =
  | "method_not_allowed"
  | "unauthorized"
  | "server_config"
  | "permission_denied"
  | "network"
  | "load_failed"
  | "profile_incomplete"
  | "budget_missing"
  | "goals_missing"
  | "stores_missing"
  | "quota_exceeded"
  | "rate_limited"
  | "ai_unavailable"
  | "ai_timeout"
  | "ai_empty"
  | "invalid_format"
  | "invalid_store"
  | "dietary_violation"
  | "portions_invalid"
  | "goal_incoherent"
  | "budget_too_low"
  | "generation_failed"
  | "unexpected";
