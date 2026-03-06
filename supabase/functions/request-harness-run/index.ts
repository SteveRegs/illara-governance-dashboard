import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function makeIdempotencyKey(body: any, run_label: string) {
  // Keep it stable and boring. Avoid IP/time.
  const env =
    typeof body?.environment === "string" && body.environment.trim()
      ? body.environment.trim()
      : "prod";

  const target =
    typeof body?.target_system === "string" && body.target_system.trim()
      ? body.target_system.trim()
      : "governance_dashboard";

  // For harness_recheck, we want a single logical stream per env/target.
  if (run_label === "harness_recheck") {
    return `harness_recheck::${env}::${target}`;
  }

  // Default: still provide an idempotency key if caller supplies one
  if (typeof body?.idempotency_key === "string" && body.idempotency_key.trim()) {
    return body.idempotency_key.trim();
  }

  // Otherwise, no idempotency for ad-hoc labels unless you choose to enforce it.
  return null;
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

  // ---- Server config ----
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

// Required: service role key for DB writes (bypasses RLS)
const ENV_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!SUPABASE_URL || !ENV_SERVICE_ROLE) {
  return json(500, {
    error: "Server misconfigured",
    detail: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  });
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

  if (recentErr) {
    return json(500, { error: "Broker query failed", detail: recentErr.message });
  }
  if (recent && recent.length > 0) {
    return json(429, {
      error: "Too many requests",
      detail: "Please wait a few seconds and try again.",
    });
  }

  const body = await req.json().catch(() => ({} as any));
  const source = typeof body?.source === "string" ? body.source : "dashboard";
  const run_label =
    typeof body?.run_label === "string" ? body.run_label : "harness_request";

  const idempotency_key = makeIdempotencyKey(body, run_label);

  const xff = req.headers.get("x-forwarded-for");
  const request_ip =
    req.headers.get("cf-connecting-ip") ||
    (xff ? xff.split(",")[0].trim() : null);

  // --- NEW GUARD: only one active PENDING harness_recheck at a time ---
  if (run_label === "harness_recheck") {
    const { data: pending, error: pendingErr } = await admin
      .from("harness_run_requests")
      .select("id, created_at")
      .eq("run_label", "harness_recheck")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1);

    if (pendingErr) {
      return json(500, {
        ok: false,
        reason: "db_error",
        error: "Failed to check for existing pending harness requests",
        detail: pendingErr.message,
      });
    }

    if (pending && pending.length > 0) {
      return json(409, {
        ok: false,
        reason: "already_pending",
        message: "Harness run already awaiting approval.",
        existing_id: pending[0].id,
        existing_created_at: pending[0].created_at,
      });
    }
  }

  const insertRow: any = { source, run_label, request_ip };

  if (idempotency_key) insertRow.idempotency_key = idempotency_key;

  // Optional: preserve structured request info for executor
  if (body?.request_payload && typeof body.request_payload === "object") {
    insertRow.request_payload = body.request_payload;
  }
  if (typeof body?.requested_run_mode === "string") {
    insertRow.requested_run_mode = body.requested_run_mode;
  }

  const { data, error } = await admin
    .from("harness_run_requests")
    .insert(insertRow)
    .select("id, status, created_at, idempotency_key")
    .single();

  if (error) {
    // Unique idempotency_key collision => return existing row as 409
    if (
      idempotency_key &&
      (error.code === "23505" ||
        (typeof error.message === "string" && error.message.includes("idempotency_key")))
    ) {
    const { data: existing } = await admin
      .from("harness_run_requests")
      .select("id, status, created_at, idempotency_key")
      .eq("idempotency_key", idempotency_key)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json(409, {
      ok: false,
      reason: "duplicate_idempotency_key",
      message: "Duplicate request blocked by idempotency key.",
      idempotency_key,
      existing,
    });
  }

  return json(500, {
    error: "Failed to enqueue request",
    detail: error.message,
    code: error.code,
  });
}

  return json(200, { ok: true, request: data });
});