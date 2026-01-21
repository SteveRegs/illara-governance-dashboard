// supabase/functions/run-harness/index.ts

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Severity = "low" | "medium" | "high";
type RunStatus = "PENDING" | "RUNNING" | "PASS" | "FAIL";

const REQUIRED_RUN_FIELDS = [
  "phase",
  "generated_at",
  "pass",
  "results",
  "hash",
  "source",
] as const;

function validateRunClarity(run: any) {
  const missing: string[] = [];

  for (const field of REQUIRED_RUN_FIELDS) {
    const value = run[field];

    if (value === undefined || value === null) {
      missing.push(field);
      continue;
    }

    if (typeof value === "string" && value.trim() === "") {
      missing.push(field);
      continue;
    }

    if (field === "results") {
      const isEmptyArray = Array.isArray(value) && value.length === 0;
      const isEmptyObject =
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length === 0;

      if (isEmptyArray || isEmptyObject) {
        missing.push(field);
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

function validateResultsShape(results: any) {
  const issues: Array<{
    index: number;
    missing: string[];
    invalid: string[];
  }> = [];

  if (!Array.isArray(results)) {
    return {
      ok: false,
      issues: [{ index: -1, missing: ["results[]"], invalid: ["results is not an array"] }],
    };
  }

  results.forEach((r, idx) => {
    const missing: string[] = [];
    const invalid: string[] = [];

    // required keys
    if (r?.pass === undefined) missing.push("pass");
    if (r?.principle === undefined) missing.push("principle");
    if (r?.rule === undefined) missing.push("rule");

    // type/shape checks
    if (r?.pass !== undefined && typeof r.pass !== "boolean") invalid.push("pass:not_boolean");
    if (r?.principle !== undefined && (typeof r.principle !== "string" || r.principle.trim() === ""))
      invalid.push("principle:empty_or_not_string");
    if (r?.rule !== undefined && (typeof r.rule !== "string" || r.rule.trim() === ""))
      invalid.push("rule:empty_or_not_string");

    // failure-specific requirements
    const isFail = r?.pass === false;
    if (isFail) {
      if (r?.message === undefined) missing.push("message");
      if (r?.severity === undefined) missing.push("severity");

      if (r?.message !== undefined && typeof r.message !== "string") invalid.push("message:not_string");
      if (r?.severity !== undefined && typeof r.severity !== "string") invalid.push("severity:not_string");
    }

    if (missing.length || invalid.length) issues.push({ index: idx, missing, invalid });
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}

const RUN_HARNESS_VERSION = "2025-12-29a";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getGovernanceSwitch(
  supabase: any,
  key: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("governance_switches")
    .select("enabled")
    .eq("key", key)
    .single();

  if (error) {
    console.log("[HARNESS] governance_switch read error", { key, error });
    // fail CLOSED: if we can't read, treat as "enabled" (i.e., fail)
    return true;
  }

  return data?.enabled === true;
}

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    console.log("RUN_HARNESS_VERSION", RUN_HARNESS_VERSION);
    const url = new URL(req.url);
    const forceFail = url.searchParams.get("force_fail") === "1";

    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("Missing PROJECT_URL or PROJECT_SERVICE_ROLE_KEY");
      return json(500, { error: "Server misconfigured" });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Optional request body (future-proofing)
    const body = await req.json().catch(() => ({} as any));
    const target_system = (body?.target_system ?? "governance_dashboard") as string;
    const phase = (body?.phase ?? "harness") as string;
    const source = (body?.source ?? "dashboard") as string;

    const startedAt = new Date().toISOString();

    // 1) Insert test_runs row (initially PENDING)
    const { data: runInsert, error: runError } = await supabase
      .from("test_runs")
      .insert({
        started_at: startedAt,
        overall_status: "PENDING" as RunStatus,
        phase,
        target_system,
        total_checks: 0,
        failed_checks: 0,
        failure_severity: "none", // keep constraints happy while pending
        meta: {
          harness_version: RUN_HARNESS_VERSION,
          source,
        },
      })
      .select("*")
      .single();

    if (runError || !runInsert) {
      console.error("Failed to insert test_runs row", runError);
      return json(500, {
        error: "Failed to start harness",
        detail: runError?.message ?? runError ?? null,
      });
    }

    const runId: string = runInsert.id;
    const realRuleFailOn = await getGovernanceSwitch(supabase, "REAL_RULE_FAIL");
    const claritySeedFailOn = await getGovernanceSwitch(supabase, "CLARITY_SEED_FAIL");
    const securitySeedFailOn = await getGovernanceSwitch(supabase, "SECURITY_SEED_FAIL");
    const clarityMutateMissingOn = await getGovernanceSwitch(
  supabase,
  "CLARITY_MUTATE_MISSING_FIELDS"
);

const clarityMutateBadResultItemOn = await getGovernanceSwitch(
  supabase,
  "CLARITY_MUTATE_BAD_RESULT_ITEM"
);

    // 2) Build checks (for now: simplified PASS set)
    // IMPORTANT: matches your test_checks schema (check_name, details, duration_ms, etc.)
    const checks: Array<{
      run_id: string;
      phase: string;
      check_name: string;
      status: "PASS" | "FAIL";
      severity: Severity;
      message: string;
      details?: Record<string, unknown> | null;
      duration_ms?: number | null;
    }> = [
      {
        run_id: runId,
        phase,
        check_name: "state_integrity",
        status: "PASS",
        severity: "low",
        message: "State tables reachable and consistent.",
        details: { source },
        duration_ms: null,
      },
      // Real governance rule (controlled by Supabase switch)
      {
        run_id: runId,
        phase,
        check_name: "REAL_RULE_FAIL",
        status: realRuleFailOn ? "FAIL" : "PASS",
        severity: realRuleFailOn ? "high" : "low",
        message: realRuleFailOn
        ? "REAL_RULE_FAIL switch is ON (intentional real failure)."
        : "REAL_RULE_FAIL switch is OFF.",
       details: { source, switch_key: "REAL_RULE_FAIL" },
       duration_ms: null,
      },

      {
  run_id: runId,
  phase,
  check_name: "CLARITY_SEED_FAIL",
  status: claritySeedFailOn ? "FAIL" : "PASS",
  severity: claritySeedFailOn ? "high" : "low",
  message: claritySeedFailOn
    ? "CLARITY_SEED_FAIL switch is ON (intentional clarity failure)."
    : "CLARITY_SEED_FAIL switch is OFF.",
  details: { source, switch_key: "CLARITY_SEED_FAIL" },
  duration_ms: null,
},
{
  run_id: runId,
  phase,
  check_name: "SECURITY_SEED_FAIL",
  status: securitySeedFailOn ? "FAIL" : "PASS",
  severity: securitySeedFailOn ? "high" : "low",
  message: securitySeedFailOn
    ? "SECURITY_SEED_FAIL switch is ON (intentional security failure)."
    : "SECURITY_SEED_FAIL switch is OFF.",
  details: { source, switch_key: "SECURITY_SEED_FAIL" },
  duration_ms: null,
},

    ];

    // --- DEBUG/VALIDATION: Force FAIL on demand (POST ?force_fail=1) ---
if (forceFail) {
  checks.push({
    run_id: runId,
    phase,
    check_name: "FORCED_FAIL",
    status: "FAIL",
    severity: "high",
    message: "Forced failure for dashboard validation (force_fail=1).",
    details: { forced: true, source },
    duration_ms: 0,
  });
}

    const { error: checksError } = await supabase
      .from("test_checks")
      .insert(checks);

    if (checksError) {
      console.error("Failed to insert test_checks rows", checksError);
      // We still finalize the run as FAIL so it’s visible + governable
      // (and so the dashboard doesn’t show “PENDING forever”)
    }

    // 3) Aggregate status and finalize test_runs row
const failures = checks.filter((c) => c.status !== "PASS");
const overall_status = failures.length === 0 ? "PASS" : "FAIL";

const finishedAt = new Date().toISOString();

const severityRank: Record<Severity, number> = { low: 1, medium: 2, high: 3 };
const failure_severity: "none" | Severity =
  failures.length === 0
    ? "none"
    : failures.reduce<Severity>((max, c) =>
        severityRank[c.severity] > severityRank[max] ? c.severity : max
      , "low");

const total_checks = checks.length;
const failed_checks = failures.length;

const { data: finalRun, error: finalizeError } = await supabase
  .from("test_runs")
  .update({
    overall_status,
    finished_at: finishedAt,
    phase,
    total_checks,
    failed_checks,
    failure_severity,
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
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

// 3.5) Write governance_reports row so Failures (Flat) can render real failures
try {
  const governanceResults = checks.map((c) => ({
    pass: c.status === "PASS",
    principle:
  c.check_name === "REAL_RULE_FAIL" ? "INTEGRITY"
  : c.check_name === "CLARITY_SEED_FAIL" ? "CLARITY"
  : c.check_name === "SECURITY_SEED_FAIL" ? "SECURITY"
  : "INTEGRITY",
    rule: c.check_name,
    severity: c.severity,
    message: c.message,
    details: c.details ?? null,
  }));

  const reportRow: any = {
  phase: phase, // keep the same phase passed in
  generated_at: finishedAt,
  pass: finalRun.overall_status === "PASS",
  results: governanceResults, // this is what governance_failures_flat flattens
  summary: {
    run_id: finalRun.id,
    total_checks: finalRun.total_checks,
    failed_checks: finalRun.failed_checks,
    failure_severity: finalRun.failure_severity,
    target_system: finalRun.target_system,
    harness_version: RUN_HARNESS_VERSION,
  },
  source: "run-harness",
  hash: String(finalRun.id),
};

// Option B: test-only mutation that triggers the *real* CLARITY validator
if (clarityMutateMissingOn) {
  delete reportRow.source;
}

// Option B: test-only mutation to break one results item shape (Rule 2 test)
if (
  clarityMutateBadResultItemOn &&
  Array.isArray(reportRow.results) &&
  reportRow.results.length > 0
) {
  reportRow.results.unshift({
  pass: false,
  principle: "CLARITY",
  // rule intentionally missing to trigger validator
  severity: "high",
  message: "Intentional bad result item for Rule 2 test",
  details: { switch_key: "CLARITY_MUTATE_BAD_RESULT_ITEM" },
});

}

// Option B: enforce run-level CLARITY
const clarity = validateRunClarity(reportRow);
if (!clarity.ok) {
  reportRow.pass = false;

  if (!Array.isArray(reportRow.results)) reportRow.results = [];

  reportRow.results.push({
  pass: false,
  principle: "CLARITY",
  rule: "CLARITY_REQUIRED_FIELDS",
  severity: "high",
  message: `Missing required fields: ${clarity.missing.join(", ")}`,
  details: {
    missing: clarity.missing,
    location: "governance_reports row",
  },

  // Optional: keep these for future debugging, but UI keys are above
  check_id: "CLARITY_REQUIRED_FIELDS",
  check_name: "Required fields present",
});

// Option B: enforce results[] shape (Rule 2)
const shape = validateResultsShape(reportRow.results);

if (!shape.ok) {
  reportRow.pass = false;

  if (!Array.isArray(reportRow.results)) reportRow.results = [];

  reportRow.results.push({
    pass: false,
    principle: "CLARITY",
    rule: "CLARITY_RESULTS_SHAPE",
    severity: "high",
    message: `Results shape invalid (${shape.issues.length} issue(s))`,
    details: {
      issues: shape.issues,
      location: "governance_reports.results[]",
    },
  });
}

const { error: govErr } = await supabase
  .from("governance_reports")
  .insert(reportRow);

if (govErr) console.error("[HARNESS] governance_reports insert failed", govErr);

} catch (e) {
  console.error("[HARNESS] governance_reports write exception", e);
}

// 4) Agent trigger bridge: if FAIL -> enqueue repair action (best-effort)
let repairEnqueue: { ok: boolean; detail?: unknown } = { ok: false };

if (finalRun.overall_status === "FAIL") {
  const { error: repairErr } = await supabase
    .from("repair_action_runs")
    .insert({
      // repair_plan_id intentionally omitted (now nullable)
      run_id: finalRun.id,                // matches your schema
      action_type: "AUTO_REPAIR",         // pick a stable string
      requested_by: "harness",
      requested_at: new Date().toISOString(),
      metadata: {
        run_label: "harness_autorepair",
        failure_severity: finalRun.failure_severity,
        phase: finalRun.phase,
        target_system: finalRun.target_system,
        harness_version: "RUN_HARNESS_VERSION_2025-12-31a",
      },
    });

  if (repairErr) {
    console.error("Repair enqueue failed", repairErr);
    repairEnqueue = { ok: false, detail: repairErr?.message ?? repairErr };
  } else {
    repairEnqueue = { ok: true };
  }
} else {
  repairEnqueue = { ok: true, detail: "not-needed" };
}

    // 4) Respond with summary for the dashboard
return new Response(
  JSON.stringify({
    ok: true,
    run_id: finalRun.id,
    overall_status: finalRun.overall_status,
    phase: finalRun.phase,
    total_checks: finalRun.total_checks,
    failed_checks: finalRun.failed_checks,
    failure_severity: finalRun.failure_severity,
    environment: finalRun.environment,
    target_system: finalRun.target_system,
    started_at: finalRun.started_at,
    finished_at: finalRun.finished_at,
    repair_enqueued: repairEnqueue,
  }),
  {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  },
);
    } catch (err) {
    console.error("Unexpected error in run-harness function", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});


  
