// supabase/functions/recompute_failure_window_v1/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Severity = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
const SEVERITY_ORDER: Record<Severity, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// Build marker (used to prove which code is running in production)
const BUILD = "recompute_failure_window_v1@2026-01-25T16:45Z";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-debug, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard governance invariants for this function (Class I):
// - No schema changes
// - No writes to protected base governance tables
// - Only writes to public_governance_window_cache_v1
// - No cross-domain access

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
    }
    // Only allow POST to avoid accidental triggering by crawlers
    if (req.method !== "POST") {
      return json({ ok: false, error: "Method Not Allowed", build: BUILD }, 405);
    }

    // --- Illara Pragmatic auth gate (publishable key) ---
    const providedKey = (
      req.headers.get("x-api-key") ??
      req.headers.get("apikey") ??
      ""
    ).trim();

    const expectedKey = (Deno.env.get("SB_PUBLISHABLE_KEY") ?? "").trim();

    if (!expectedKey) {
      return json(
        { ok: false, error: "Missing SB_PUBLISHABLE_KEY secret", build: BUILD },
        500
      );
    }

    if (providedKey !== expectedKey) {
      return json({ ok: false, error: "Invalid API key", build: BUILD }, 401);
    }
    // --- end auth gate ---

    // --- env gate for internal Supabase calls ---
    const SUPABASE_URL =
      (Deno.env.get("SUPABASE_URL") ?? Deno.env.get("PROJECT_URL") ?? "").trim();
    const SERVICE_ROLE_KEY =
      (Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("ILLARA_SERVICE_ROLE_KEY") ?? "").trim();

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json(
        { ok: false, error: "Missing required env vars", build: BUILD },
        500
      );
    }
  
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    // --- end env gate ---

    // Window definition: last 24h ending now
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);

    // 1) Get latest harness run_id (public-safe view)
    const { data: latestRunRows, error: runErr } = await supabase
      .from("public_harness_recent")
      .select("run_id, started_at, overall_status")
      .order("started_at", { ascending: false })
      .limit(1);

    if (runErr) throw runErr;

    const latestRun = latestRunRows?.[0] ?? null;
    const run_id: string | null = latestRun?.run_id ?? null;

    // 2) Count failures + compute highest severity from public-safe failures view
    const { data: failureRows, error: failErr } = await supabase
      .from("public_governance_failures_flat")
      .select("severity, generated_at")
      .gte("generated_at", windowStart.toISOString())
      .lte("generated_at", windowEnd.toISOString());

    if (failErr) throw failErr;

    const failures = failureRows ?? [];
    let highest: Severity = "NONE";

    for (const f of failures) {
      const sRaw = String(f?.severity ?? "NONE").toUpperCase();
      const s: Severity =
        (sRaw as Severity) in SEVERITY_ORDER ? (sRaw as Severity) : "NONE";
      if (SEVERITY_ORDER[s] > SEVERITY_ORDER[highest]) highest = s;
    }

    const payload = {
      key: "current",
      computed_at: new Date().toISOString(),
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      run_id,
      failure_count: failures.length,
      highest_severity: highest,
      details: {
        source: "recompute_failure_window_v1",
        window_hours: 24,
        latest_run_seen: !!run_id,
      },
    };

    // 3) Upsert into cache table
    const { error: upsertErr } = await supabase
      .from("public_governance_window_cache_v1")
      .upsert(payload, { onConflict: "key" });

    if (upsertErr) throw upsertErr;

    // 4) Post-execution verification: re-read the public view for key="current"
    const { data: verifyRows, error: verifyErr } = await supabase
      .from("public_governance_window_v1")
      .select("*")
      .eq("key", "current")
      .limit(1);

    if (verifyErr) throw verifyErr;

    const verified = verifyRows?.[0] ?? null;

    return json({ ok: true, computed: payload, verified }, 200);
  } catch (e) {
    return json(
      { ok: false, error: String((e as any)?.message ?? e), build: BUILD },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}


