import type { User } from "@supabase/supabase-js";

/** Name shown in the UI: profile name if present, otherwise the email prefix. */
export function displayNameFromUser(user: User, fallback = "Usuario"): string {
  const metaName = user.user_metadata?.full_name;

  if (typeof metaName === "string" && metaName.trim()) {
    return metaName.trim();
  }

  const emailPrefix = user.email?.split("@")[0];

  if (emailPrefix) {
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
  }

  return fallback;
}
