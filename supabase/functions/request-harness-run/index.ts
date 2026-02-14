import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // --- Basic caller gate: require a JWT-ish key in apikey or Bearer (dashboard sends anon) ---
  const authHeader = req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const apikey = (req.headers.get("apikey") || "").trim();
  const reqKey = apikey || bearer;

  if (!reqKey || !reqKey.startsWith("eyJ")) {
    return json(401, { error: "Missing/invalid API key" });
  }

  // --- Server config ---
  const SUPABASE_URL =
    Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL") || "";

  // Optional: if you want to ensure the caller is using *your* anon key specifically:
  const ENV_ANON =
    Deno.env.get("ILLARA_ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

  // Required: service role key for DB writes (bypasses RLS)
  const ENV_SERVICE_ROLE = Deno.env.get("ILLARA_SERVICE_ROLE_KEY") || "";

  if (!SUPABASE_URL || !ENV_SERVICE_ROLE) {
    return json(500, {
      error: "Server misconfigured",
      detail: "Missing PROJECT_URL/SUPABASE_URL or ILLARA_SERVICE_ROLE_KEY",
   });
  }

  // If you want strict matching against the anon key, enforce it here:
  // (If you don't care, you can delete this block.)
  if (ENV_ANON && reqKey !== ENV_ANON) {
    return json(401, { error: "Unauthorized", detail: "Invalid anon key" });
  }

  // --- Service-role client for broker write / cooldown query ---
  const admin = createClient(SUPABASE_URL, ENV_SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // simple cooldown: reject if a request was created in last 15s
  const since = new Date(Date.now() - 15_000).toISOString();
  const { data: recent, error: recentErr } = await admin
    .from("harness_run_requests")
    .select("id, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recentErr) return json(500, { error: "Broker query failed", detail: recentErr.message });
  if (recent && recent.length > 0) {
    return json(429, { error: "Too many requests", detail: "Please wait a few seconds and try again." });
  }

  const body = await req.json().catch(() => ({} as any));
  const source = typeof body?.source === "string" ? body.source : "dashboard";
  const run_label = typeof body?.run_label === "string" ? body.run_label : "harness_request";

  const request_ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    null;

  const { data, error } = await admin
    .from("harness_run_requests")
    .insert({ source, run_label, request_ip })
    .select("id, status, created_at")
    .single();

  if (error) return json(500, { error: "Failed to enqueue request", detail: error.message });

  return json(200, { ok: true, request: data });
});
