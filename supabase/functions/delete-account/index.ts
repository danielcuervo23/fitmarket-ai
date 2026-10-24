import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { logEvent } from "../_shared/log.ts";

/**
 * Permanently deletes the signed-in user's account. Profile, goals,
 * supermarkets, plans and generation records are removed by the
 * `on delete cascade` foreign keys on auth.users.
 *
 * Only the caller's own account can be deleted: the user id comes from the
 * verified JWT, never from the request body.
 */
Deno.serve(async (req: Request) => {
  const json = (body: Record<string, unknown>, status = 200) =>
    jsonResponse(req, body, status);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Not signed in", code: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Server misconfigured", code: "server_config" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return json({ error: "Not signed in", code: "unauthorized" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(
      user.id,
    );

    if (deleteError) {
      logEvent("account_delete_failed");
      return json({ error: "Could not delete account", code: "unexpected" }, 500);
    }

    logEvent("account_deleted");
    return json({ ok: true });
  } catch {
    return json({ error: "Unexpected error", code: "unexpected" }, 500);
  }
});
