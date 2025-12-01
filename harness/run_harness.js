// harness/run_harness.js

// === CONFIG ===
// These are safe to keep here for now; this script isn't shipped to the browser.
const SUPABASE_URL = "https://hwikvkhsujegdvuszlmc.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3aWt2a2hzdWplZ2R2dXN6bG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM3MTM5MjcsImV4cCI6MjA2OTI4OTkyN30.R1V3bnYYOhoP9O8fs0TFL0Giz6w8LZCXCg03TGz2MUI";

// Your GitHub Pages dashboard URL
const DASHBOARD_URL = "https://steveregs.github.io/illara-governance-dashboard/dashboard/";

// Convenience headers for Supabase REST
const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

// Simple helper: now as ISO string
const nowIso = () => new Date().toISOString();

// --- Supabase helpers ---

async function insertTestRun() {
  const body = {
    started_at: nowIso(),
    overall_status: "PENDING",
    environment: "prod",
    target_system: "governance_dashboard",
    total_checks: 0,
    failed_checks: 0,
    failure_severity: "none",
    meta: { harness_version: "v1" },
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/test_runs`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to insert test_run: HTTP ${res.status} ${res.statusText} ${text}`
    );
  }

  const [row] = await res.json();
  if (!row || !row.id) {
    throw new Error("Supabase did not return a test_runs row");
  }

  return row;
}

async function updateTestRun(id, patch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/test_runs?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: SB_HEADERS,
      body: JSON.stringify(patch),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to update test_run ${id}: HTTP ${res.status} ${res.statusText} ${text}`
    );
  }
}

async function insertTestCheck(runId, check) {
  const body = {
    run_id: runId,
    check_name: check.check_name,
    status: check.status,
    severity: check.severity || "low",
    message: check.message || null,
    details: check.details || null,
    duration_ms: check.duration_ms ?? null,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/test_checks`, {
    method: "POST",
    headers: SB_HEADERS,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Failed to insert test_check ${check.check_name}: HTTP ${res.status} ${res.statusText} ${text}`
    );
  }
}

// --- Individual checks ---

async function runSupabasePing(runId) {
  const start = performance.now();
  let status = "FAIL";
  let severity = "high";
  let message = "";
  let details = null;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/governance_reports?select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    const duration_ms = Math.round(performance.now() - start);

    if (!res.ok) {
      message = `HTTP ${res.status} ${res.statusText}`;
      details = { status: res.status, statusText: res.statusText };
    } else {
      const data = await res.json();
      status = "PASS";
      severity = "low";
      message = `Fetched ${data.length} governance_reports row(s)`;
      details = { rowCount: data.length };
    }

    await insertTestCheck(runId, {
      check_name: "supabase_ping",
      status,
      severity,
      message,
      details,
      duration_ms,
    });

    return { status, severity };
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start);
    await insertTestCheck(runId, {
      check_name: "supabase_ping",
      status: "FAIL",
      severity: "high",
      message: "Exception during Supabase ping",
      details: { error: String(err) },
      duration_ms,
    });
    return { status: "FAIL", severity: "high" };
  }
}

async function runDashboardHttp(runId) {
  const start = performance.now();
  let status = "FAIL";
  let severity = "medium";
  let message = "";
  let details = null;

  try {
    const res = await fetch(DASHBOARD_URL, { method: "GET" });
    const duration_ms = Math.round(performance.now() - start);
    const text = await res.text();

    if (!res.ok) {
      message = `HTTP ${res.status} ${res.statusText}`;
      details = { status: res.status, statusText: res.statusText };
    } else if (!text.includes("Illara Governance Dashboard")) {
      message = "Dashboard HTML loaded but expected marker text not found";
      details = { snippet: text.slice(0, 200) };
    } else {
      status = "PASS";
      severity = "low";
      message = "Dashboard page reachable and marker text found";
      details = { snippet: text.slice(0, 200) };
    }

    await insertTestCheck(runId, {
      check_name: "dashboard_http",
      status,
      severity,
      message,
      details,
      duration_ms,
    });

    return { status, severity };
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start);
    await insertTestCheck(runId, {
      check_name: "dashboard_http",
      status: "FAIL",
      severity: "medium",
      message: "Exception during dashboard HTTP check",
      details: { error: String(err) },
      duration_ms,
    });
    return { status: "FAIL", severity: "medium" };
  }
}

// --- Main orchestration ---

function severityRank(sev) {
  switch (sev) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

async function main() {
  console.log("Illara Test Harness v1 - starting run...");

  // 1) Create a test_run row
  const runRow = await insertTestRun();
  const runId = runRow.id;
  console.log("Created test_run:", runId);

  const checkResults = [];

  // 2) Run checks
  checkResults.push(await runSupabasePing(runId));
  checkResults.push(await runDashboardHttp(runId));

  // 3) Aggregate results
  const totalChecks = checkResults.length;
  const failedChecks = checkResults.filter((c) => c.status === "FAIL").length;
  const overallStatus = failedChecks > 0 ? "FAIL" : "PASS";

  let maxSeverityRank = 0;
  for (const c of checkResults) {
    maxSeverityRank = Math.max(maxSeverityRank, severityRank(c.severity));
  }
  const failureSeverity =
    overallStatus === "PASS"
      ? "none"
      : maxSeverityRank === 3
      ? "high"
      : maxSeverityRank === 2
      ? "medium"
      : "low";

  // 4) Update the test_run row
  await updateTestRun(runId, {
    finished_at: nowIso(),
    overall_status: overallStatus,
    total_checks: totalChecks,
    failed_checks: failedChecks,
    failure_severity: failureSeverity,
  });

  console.log("Harness run complete:", {
    runId,
    overallStatus,
    totalChecks,
    failedChecks,
    failureSeverity,
  });
}

// Kick it off
main().catch((err) => {
  console.error("Harness run crashed:", err);
  process.exit(1);
});

