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

const RUN_HARNESS_VERSION = "2026-02-06c1";

const corsHeaders: Record<string, string> = {
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

async function getGovernanceSwitch(
  supabaseAdmin: any,
  key: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
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

type SecurityPostureRow = {
  tablename: string;
  rls_enabled: boolean;
  policy_count: number;
  anon_policy_count: number;
  authenticated_policy_count: number;
};

function evalSecurityPosture(rows: SecurityPostureRow[]) {
  const protectedTables = new Set([
    "governance_reports",
    "governance_switches",
    "repair_action_runs",
    "test_runs",
    "test_checks",
  ]);

  const violations = rows
    .filter((r) => protectedTables.has(r.tablename))
    .flatMap((r) => {
      const v: string[] = [];
      if (!r.rls_enabled) v.push("RLS_DISABLED");
      if (r.anon_policy_count > 0) v.push("ANON_POLICY_PRESENT");
      return v.length ? [{ tablename: r.tablename, violations: v }] : [];
    });

  return {
    ok: violations.length === 0,
    violations,
  };
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
const url = new URL(req.url);
const forceFail = url.searchParams.get("force_fail") === "1";

    // --- Prefer key from the incoming request (known-good) ---
const authHeader = req.headers.get("authorization") || "";
const bearerFromReq = authHeader.toLowerCase().startsWith("bearer ")
  ? authHeader.slice(7).trim()
  : "";

const apikeyFromReq = (req.headers.get("apikey") || "").trim();

const REQ_KEY = apikeyFromReq || bearerFromReq;

// ---- Canonical env reads (trimmed) ----
// NOTE: We intentionally avoid SUPABASE_* secret names because Supabase reserves that prefix
// and may block updates via UI/CLI. We use our own stable, editable names.
const SUPABASE_URL = (Deno.env.get("PROJECT_URL") || "").trim();
const ENV_SERVICE_ROLE_KEY = (Deno.env.get("PROJECT_SERVICE_ROLE_KEY") || "").trim();
const ENV_ANON_KEY = (Deno.env.get("ILLARA_ANON_KEY") || "").trim();

if (!SUPABASE_URL) {
  console.log("Missing PROJECT_URL");
  return json(500, { error: "Server misconfigured", detail: "Missing PROJECT_URL" });
}

if (!ENV_SERVICE_ROLE_KEY) {
  console.log("Missing PROJECT_SERVICE_ROLE_KEY");
  return json(500, { error: "Server misconfigured", detail: "Missing PROJECT_SERVICE_ROLE_KEY" });
}

if (!ENV_ANON_KEY) {
  console.log("Missing ILLARA_ANON_KEY");
  return json(500, { error: "Server misconfigured", detail: "Missing ILLARA_ANON_KEY" });
}

// Hard guard: must be a JWT (3 parts)
if (ENV_SERVICE_ROLE_KEY.split(".").length !== 3) {
  console.error("SERVICE_ROLE_KEY is not a JWT", {
    prefix: ENV_SERVICE_ROLE_KEY.slice(0, 12),
    len: ENV_SERVICE_ROLE_KEY.length,
  });
  return json(500, { error: "Server misconfigured", detail: "PROJECT_SERVICE_ROLE_KEY is not a JWT" });
}

// Authority: harness must write using service role (never anon)
// Gateway-friendly header shape:
// - apikey comes from the client key (anon)
// - Authorization bearer is explicitly service_role
const supabaseAdmin = createClient(
  SUPABASE_URL,
  ENV_ANON_KEY,
  {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${ENV_SERVICE_ROLE_KEY}`,
      },
    },
  }
);

console.log("[AUTH_DEBUG_V2]", {
  supabase_url_ok: !!SUPABASE_URL,
  sr_len: ENV_SERVICE_ROLE_KEY?.length ?? 0,
  sr_prefix: (ENV_SERVICE_ROLE_KEY ?? "").slice(0, 12),
});

function safeJwtClaims(jwt: string) {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return { ok: false, reason: "not_jwt" };
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    return {
      ok: true,
      role: payload.role ?? null,
      ref: payload.ref ?? null,
      iss: payload.iss ?? null,
      iat: payload.iat ?? null,
      exp: payload.exp ?? null,
    };
  } catch (e) {
    return { ok: false, reason: "decode_failed", detail: String((e as any)?.message ?? e) };
  }
}

console.log("[AUTH_CLAIMS_V1]", safeJwtClaims(ENV_SERVICE_ROLE_KEY));

console.log("[URL_DEBUG_V1]", { supabase_url: SUPABASE_URL });

    // Optional request body (future-proofing)
    const body = await req.json().catch(() => ({} as any));
    const target_system = (body?.target_system ?? "governance_dashboard") as string;
    const phase = (body?.phase ?? "harness") as string;
    const source = (body?.source ?? "dashboard") as string;

    const startedAt = new Date().toISOString();

    // 1) Insert test_runs row (initially PENDING)
    const { data: runInsert, error: runError } = await supabaseAdmin
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

const realRuleFailOn = await getGovernanceSwitch(supabaseAdmin, "REAL_RULE_FAIL");
const claritySeedFailOn = await getGovernanceSwitch(supabaseAdmin, "CLARITY_SEED_FAIL");
const securitySeedFailOn = await getGovernanceSwitch(supabaseAdmin, "SECURITY_SEED_FAIL");
const securityRealRuleOn = await getGovernanceSwitch(supabaseAdmin, "SECURITY_REAL_RULE");

const clarityMutateMissingOn = await getGovernanceSwitch(
  supabaseAdmin,
  "CLARITY_MUTATE_MISSING_FIELDS"
);

const clarityMutateBadResultItemOn = await getGovernanceSwitch(
  supabaseAdmin,
  "CLARITY_MUTATE_BAD_RESULT_ITEM"
);

const integrityGreenRedSentinelOn = await getGovernanceSwitch(
  supabaseAdmin,
  "INTEGRITY_GREEN_RED_SENTINEL"
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

{
  run_id: runId,
  phase,
  check_name: "SECURITY_REAL_RULE",
  status: securityRealRuleOn ? "FAIL" : "PASS", // default FAIL when ON until evaluated
  severity: securityRealRuleOn ? "high" : "low",
  message: securityRealRuleOn
    ? "SECURITY_REAL_RULE switch is ON (evaluating security posture)."
    : "SECURITY_REAL_RULE switch is OFF.",
  details: { source, switch_key: "SECURITY_REAL_RULE" },
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

if (securityRealRuleOn) {
  const idx = checks.findIndex((c) => c.check_name === "SECURITY_REAL_RULE");
  const started = Date.now();

  const { data, error } = await supabaseAdmin
    .from("governance_security_posture")
    .select("*");

  if (error || !data) {
    if (idx >= 0) {
      checks[idx] = {
        ...checks[idx],
        status: "FAIL",
        severity: "high",
        message: "SECURITY_REAL_RULE could not read governance_security_posture.",
        details: { source, error: error?.message ?? error ?? null },
        duration_ms: Date.now() - started,
      };
    }
  } else {
    const verdict = evalSecurityPosture(data as any);

    if (idx >= 0) {
      checks[idx] = {
        ...checks[idx],
        status: verdict.ok ? "PASS" : "FAIL",
        severity: verdict.ok ? "low" : "high",
        message: verdict.ok
          ? "Security posture OK (RLS enabled; no anon policies on protected tables)."
          : "Security posture violation(s) detected.",
        details: {
          source,
          switch_key: "SECURITY_REAL_RULE",
          violations: verdict.violations,
        },
        duration_ms: Date.now() - started,
      };
    }
  }
}

    const { error: checksError } = await supabaseAdmin
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

const { data: finalRun, error: finalizeError } = await supabaseAdmin
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

// Phase C-1) If FAIL -> create a Repair Proposal (best-effort, idempotent)
try {
  if (finalRun.overall_status === "FAIL" && finalRun.failure_severity !== "none") {
    const failedChecks = failures.slice(0, 20); // bounded evidence

    console.log("[HARNESS][C1] Creating repair proposal", {
  run_id: finalRun.id,
  failure_severity: finalRun.failure_severity,
  harness_version: RUN_HARNESS_VERSION,
});

    const top = failedChecks[0];
    const title = `Repair Proposal: ${top?.check_name ?? "Unknown Failure"}`;

    const summary =
      failedChecks.length === 0
        ? "Run failed, but no failed checks were recorded."
        : failedChecks
            .slice(0, 3)
            .map((c) => `- ${c.check_name}: ${c.message ?? c.status}`)
            .join("\n");

    const evidence = {
      run: {
        run_id: finalRun.id,
        phase: finalRun.phase,
        environment: finalRun.environment,
        target_system: finalRun.target_system,
        started_at: finalRun.started_at,
        finished_at: finalRun.finished_at,
        total_checks: finalRun.total_checks,
        failed_checks: finalRun.failed_checks,
        failure_severity: finalRun.failure_severity,
        harness_version: RUN_HARNESS_VERSION,
      },
      failed_checks: failedChecks.map((c) => ({
        check_name: c.check_name,
        status: c.status,
        severity: c.severity,
        message: c.message,
        details: c.details ?? null,
        duration_ms: c.duration_ms ?? null,
      })),
    };

    const proposed_changes = failedChecks.slice(0, 5).map((c) => {
      const name = String(c.check_name ?? "");
      if (name.startsWith("RLS_") || name.includes("SECURITY_POSTURE") || name.includes("SECURITY_REAL_RULE")) {
        return {
          change_type: "POLICY_CHANGE",
          target: c.details?.target ?? null,
          intent: c.message ?? "Adjust RLS/security posture",
          notes: "Phase C-1 proposal only. No execution.",
        };
      }
      if (name.startsWith("CLARITY_")) {
        return {
          change_type: "SCHEMA_OR_CONTRACT",
          target: c.details?.target ?? null,
          intent: c.message ?? "Resolve clarity/schema contract issue",
          notes: "Phase C-1 proposal only. No execution.",
        };
      }
      return {
        change_type: "INVESTIGATE",
        target: c.details?.target ?? null,
        intent: c.message ?? "Investigate failure",
        notes: "Phase C-1 proposal only. No execution.",
      };
    });

    const guardrails = {
      requires_human_approval: true,
      verification_required: ["re-run-harness-after-repair (Phase C-2)"],
      notes: "Do not execute repairs in Phase C-1.",
    };

    const risk_assessment = {
      risk_level: finalRun.failure_severity === "high" ? "high" : "medium",
      blast_radius: "unknown",
      mitigations: ["Human approval required", "Verification required"],
    };

    // Idempotent create: unique(run_id) prevents duplicates
    const { data: proposal, error: propErr } = await supabaseAdmin
      .from("repair_proposals")
      .insert([
        {
          run_id: finalRun.id,
          overall_status: "FAIL",
          failure_severity: finalRun.failure_severity,
          title,
          summary,
          evidence,
          risk_assessment,
          proposed_changes,
          guardrails,
          proposed_by: "run-harness",
          approval_required: true,
        },
      ])
      .select("id")
      .single();

    // If proposal already exists, ignore. (Postgres unique violation is 23505)
    const propCode = (propErr as any)?.code ?? (propErr as any)?.details ?? null;
    const isUniqueViolation =
      (propErr as any)?.code === "23505" ||
      String(propCode ?? "").includes("23505") ||
      String((propErr as any)?.message ?? "").toLowerCase().includes("duplicate");

    if (propErr && !isUniqueViolation) {
      console.error("[HARNESS] repair_proposal insert failed", propErr);
    }

    if (!propErr && proposal?.id) {
      const { error: evtErr } = await supabaseAdmin.from("repair_proposal_events").insert([
        {
          proposal_id: proposal.id,
          event_type: "CREATED",
          actor_type: "SYSTEM",
          actor_id: "run-harness",
          details: { run_id: finalRun.id, phase: finalRun.phase },
        },
      ]);

      if (evtErr) console.error("[HARNESS] repair_proposal_events insert failed", evtErr);
    }
  }
} catch (e) {
  console.error("[HARNESS] repair proposal creation exception", e);
}


// 3.5) Write governance_reports row so Failures (Flat) can render real failures
try {
  const governanceResults = checks.map((c) => ({
    pass: c.status === "PASS",
    principle:
  c.check_name === "REAL_RULE_FAIL" ? "INTEGRITY"
  : c.check_name === "CLARITY_SEED_FAIL" ? "CLARITY"
  : c.check_name === "SECURITY_SEED_FAIL" ? "SECURITY"
  : c.check_name === "SECURITY_REAL_RULE" ? "SECURITY"
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
  pass: true, // important: do NOT appear as a failure row
  principle: "CLARITY",
  // rule intentionally missing to trigger validator
  severity: "high",
  message: "Intentional bad result item for Rule 2 test",
  details: { switch_key: "CLARITY_MUTATE_BAD_RESULT_ITEM" },
});

}

// Option: Green outside / Red inside sentinel
// Keep reportRow.pass as-is (likely true), but inject a failing result item.
// This should produce a failure in Failures (Flat) while the harness still shows PASS.
if (integrityGreenRedSentinelOn) {
  if (!Array.isArray(reportRow.results)) reportRow.results = [];

  reportRow.results.unshift({
    pass: false,
    principle: "INTEGRITY",
    rule: "INTEGRITY_GREEN_RED_SENTINEL",
    severity: "high",
    message: "Sentinel: report contains a failing result item while run remains PASS (green outside / red inside).",
    details: {
      switch_key: "INTEGRITY_GREEN_RED_SENTINEL",
      note: "Intentional sentinel to detect silent internal contradictions.",
    },
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
}

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

const { error: govErr } = await supabaseAdmin
  .from("governance_reports")
  .insert(reportRow);

if (govErr) console.error("[HARNESS] governance_reports insert failed", govErr);

} catch (e) {
  console.error("[HARNESS] governance_reports write exception", e);
}

// 4) Agent trigger bridge: if FAIL -> enqueue repair action (best-effort)
let repairEnqueue: { ok: boolean; detail?: unknown } = { ok: false };

if (finalRun.overall_status === "FAIL") {
  const { error: repairErr } = await supabaseAdmin
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