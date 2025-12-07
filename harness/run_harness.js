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

// === Demo Service health checks (Illara Demo Service v0) ===

const DEMO_SERVICE_URL =
  process.env.DEMO_SERVICE_URL || "http://localhost:4000";

async function demo_callHealth() {
  const url = `${DEMO_SERVICE_URL}/health`;
  const started = performance.now();

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const elapsed = performance.now() - started;
    return {
      ok: false,
      error: `Network error: ${err.message}`,
      elapsedMs: elapsed,
      status: null,
      body: null,
    };
  }

  const elapsed = performance.now() - started;

  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse JSON: ${err.message}`,
      elapsedMs: elapsed,
      status: res.status,
      body: null,
    };
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
    elapsedMs: elapsed,
    error: null,
  };
}

// include durationMs so we can store it in test_checks
function demo_makeResult(id, description, passed, details, durationMs) {
  return { id, description, passed, details, durationMs };
}

async function runDemoHealthChecks() {
  console.log("[DEMO] Running Illara Demo Service health checks...");
  console.log(`[DEMO] Target: ${DEMO_SERVICE_URL}/health`);

  const health = await demo_callHealth();

  if (health.error) {
    const fail = demo_makeResult(
      "DEMO_HEALTH_000",
      "Request succeeded",
      false,
      health.error,
      health.elapsedMs
    );
    console.log("[DEMO]", fail);
    return [fail];
  }

  const { status, body, elapsedMs } = health;

  const results = [];

  // DEMO_HEALTH_001: status 200
  results.push(
    demo_makeResult(
      "DEMO_HEALTH_001",
      "GET /health returns HTTP 200",
      status === 200,
      `status=${status}`,
      elapsedMs
    )
  );

  // DEMO_HEALTH_002: body.ok === true
  results.push(
    demo_makeResult(
      "DEMO_HEALTH_002",
      "GET /health returns body.ok === true",
      !!(body && body.ok === true),
      `body.ok=${body && body.ok}`,
      elapsedMs
    )
  );

  // DEMO_HEALTH_003: response time < 2000ms
  results.push(
    demo_makeResult(
      "DEMO_HEALTH_003",
      "GET /health responds in under 2000ms",
      elapsedMs < 2000,
      `elapsedMs=${elapsedMs.toFixed(1)}`,
      elapsedMs
    )
  );

  const passedCount = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(
    `[DEMO] Summary: ${passedCount}/${total} checks passed (last elapsed ≈ ${elapsedMs.toFixed(
      1
    )}ms)`
  );

  return results;
}

// --- Check: recent_runs_window (governance_recent view) ---
async function runRecentRunsWindow(runId) {
  const start = performance.now();
  let status = "FAIL";
  let severity = "medium";
  let message = "";
  let details = null;

  try {
    // Hit the same pipeline the dashboard uses for "Recent Runs"
    const url = `${SUPABASE_URL}/rest/v1/governance_recent?select=*&limit=5`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    });

    const duration_ms = Math.round(performance.now() - start);

    if (!res.ok) {
      // Non-200 → treat as failure and record the HTTP info
      message = `HTTP ${res.status} ${res.statusText} querying governance_recent`;
      details = { status: res.status, statusText: res.statusText };

      await insertTestCheck(runId, {
        check_name: "recent_runs_window",
        status: "FAIL",
        severity,
        message,
        details,
        duration_ms,
      });

      return { status: "FAIL", severity };
    }

    const data = await res.json();
    const rowCount = Array.isArray(data) ? data.length : 0;

    status = "PASS";
    severity = "low";
    message = `Fetched ${rowCount} governance_recent row(s)`;

    await insertTestCheck(runId, {
      check_name: "recent_runs_window",
      status,
      severity,
      message,
      details: { rowCount },
      duration_ms,
    });

    return { status, severity };
  } catch (err) {
    const duration_ms = Math.round(performance.now() - start);

    message = "Exception during recent_runs_window check";
    details = { error: String(err) };

    await insertTestCheck(runId, {
      check_name: "recent_runs_window",
      status: "FAIL",
      severity,
      message,
      details,
      duration_ms,
    });

    return { status: "FAIL", severity: "medium" };
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

const recentResult = await runRecentRunsWindow(runId);
checkResults.push({ name: "recent_runs_window", ...recentResult });

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

    // --- Demo Service health checks (now stored in test_checks) ---
  try {
    console.log("[HARNESS] Starting Demo Service health checks...");
    const demoResults = await runDemoHealthChecks();
    console.log("[HARNESS] Demo Service health results:", demoResults);

    for (const r of demoResults) {
      // Map each demo check into test_checks format
      const status = r.passed ? "PASS" : "FAIL";

      // Simple severity mapping for now:
      // - if it fails, call it "medium"
      // - if it passes, "low"
      const severity = r.passed ? "low" : "medium";

      await insertTestCheck(runId, {
        check_name: r.id,
        status,
        severity,
        message: r.description,
        details: {
          details: r.details,
          source: "demo_service_health",
        },
        duration_ms:
          typeof r.durationMs === "number"
            ? Math.round(r.durationMs)
            : null,
      });
    }
  } catch (err) {
    console.error("[HARNESS] Demo health checks failed:", err);
  }

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


