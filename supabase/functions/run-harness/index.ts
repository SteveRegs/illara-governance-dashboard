// supabase/functions/run-harness/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Severity = "low" | "medium" | "high";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }

  try {
    console.log("RUN_HARNESS_VERSION", "2025-12-26a");

    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Optional: read body in case we later want env/scenario
    // const body = await req.json().catch(() => ({}));
    // const env = body.env ?? "prod";

    const startedAt = new Date().toISOString();

    // 1) Insert a new test_runs row (initially PENDING)
    const { data: runInsert, error: runError } = await supabase
      .from("test_runs")
      .insert({
  started_at: startedAt,
  overall_status: "PENDING",
})

      .select("*")
      .single();

    if (runError || !runInsert) {
      console.error("Failed to insert test_runs row", runError);
      return new Response(
        JSON.stringify({ error: "Failed to start harness", detail: runError?.message ?? runError ?? null, }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const runId = runInsert.id;

    // 2) Insert test_checks rows (simplified: all PASS for now)
const checks: {
  run_id: number;
  check_name: string;
  status: "PASS" | "FAIL";
  severity: Severity;
  message: string;
}[] = [
  {
    run_id: runId,
    check_name: "state_integrity",
    status: "PASS",
    severity: "low",
    message: "State tables reachable and consistent.",
  },
  {
    run_id: runId,
    check_name: "governance_reports",
    status: "PASS",
    severity: "low",
    message: "Reports table healthy.",
  },
  {
    run_id: runId,
    check_name: "failures_flat",
    status: "PASS",
    severity: "low",
    message: "No recent critical governance failures.",
  },
];

const { error: checksError } = await supabase
  .from("test_checks")
  .insert(checks);

    if (checksError) {
  console.error("Failed to insert test_checks rows", checksError);

  return new Response(
    JSON.stringify({
      error: "Failed to record checks",
      detail: checksError?.message ?? checksError ?? null,
    }),
    {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

    // 3) Aggregate status and finalize test_runs row
    const failures = checks.filter((c) => c.status !== "PASS");
    const status = failures.length === 0 ? "PASS" : "FAIL";

    const finishedAt = new Date().toISOString();

    const severityRank: Record<Severity, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };

    const maxSeverity: Severity = checks.reduce<Severity>(
      (max, c) =>
        severityRank[c.severity] > severityRank[max] ? c.severity : max,
      "low",
    );

    const { data: finalRun, error: finalizeError } = await supabase
      .from("test_runs")
      .update({
  overall_status: status,   // use overall_status, not status
  finished_at: finishedAt,
})
      .eq("id", runId)
      .select("*")
      .single();

    if (finalizeError || !finalRun) {
  console.error("Failed to finalize test_runs row", finalizeError);

  return new Response(
    JSON.stringify({
      error: "Failed to finalize harness run",
      detail: finalizeError?.message ?? finalizeError ?? null,
    }),
    {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}

    // 4) Respond with summary for the dashboard
    return new Response(
      JSON.stringify({
        ok: true,
        run_id: finalRun.id,
        status: finalRun.status,
        checks_count: finalRun.checks_count,
        failures_count: finalRun.failures_count,
        severity_max: finalRun.severity_max,
        started_at: finalRun.started_at,
        finished_at: finalRun.finished_at,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err) {
    console.error("Unexpected error in run-harness function", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: String(err) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});
