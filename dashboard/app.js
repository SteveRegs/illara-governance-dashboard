/**
 * ============================================================
 * ILLARA GOVERNANCE DASHBOARD — SCHEMA CONTRACT
 * ============================================================
 *
 * MODE
 *   - Dashboard operates in REAL mode only.
 *   - USE_FAKE_DATA must remain false (no demo/fake paths).
 *
 * IDENTIFIERS
 *   - Governance run identifier is run_id (BIGINT) and is the ONLY valid run identifier
 *     for run-scoped governance queries.
 *   - NEVER use uuid or `id` fields to filter run-scoped governance queries.
 *   - All run_id values must be validated at the UI boundary:
 *       const n = Number(v); Number.isFinite(n) ? n : null
 *   - Mappers must enforce this:
 *       mapRecentRunRow/mapFailureRow => runId is Number(...) or null; never row.id.
 *
 * DATA SOURCES (REST views / tables)
 *   - public_governance_recent (view)
 *       Required:
 *         run_id (BIGINT)
 *         generated_at (TIMESTAMPTZ)  // ordering
 *       Common fields (used when present):
 *         phase (TEXT)
 *         status (TEXT) or pass (BOOLEAN)
 *         checks (INT), failures (INT)
 *
 *   - public_governance_failures_flat (view)
 *       Required:
 *         run_id (BIGINT)
 *         generated_at (TIMESTAMPTZ)  // ordering
 *       Common fields (used when present):
 *         phase (TEXT)
 *         principle (TEXT)
 *         rule (TEXT) or rule_code (TEXT)
 *         severity (TEXT)
 *         message (TEXT)
 *
 *   - repair_action_runs_recent_v1 (view)
 *       Required:
 *         requested_at (TIMESTAMPTZ)  // ordering
 *       Common fields (used when present):
 *         action (TEXT), status/result (TEXT), details/message (TEXT), run_id (BIGINT)
 *
 *   - public_harness_recent / test_runs (REST)
 *       Notes:
 *         - Harness run `id` is UUID (OK for harness UI).
 *         - When bridging to governance, only use governance run_id (BIGINT).
 *       Ordering:
 *         started_at DESC
 *
 * ORDERING
 *   - public_governance_recent:             generated_at DESC
 *   - public_governance_failures_flat:      generated_at DESC
 *   - repair_action_runs_recent_v1:  requested_at DESC
 *   - harness/test runs:             started_at DESC
 *
 * GUARDS
 *   - Invalid run_id values must NEVER reach Supabase filters.
 *   - Guard early; fail safely (clear UI rather than throwing).
 *
 * VERSIONING
 *   - window.__APP_VERSION__ must be updated on every deploy.
 *   - Console must log:
 *       [APP] loaded version: "<version>"
 *
 * ============================================================
 */

window.__APP_VERSION__ = "20260128a";
console.log("[APP] loaded version:", window.__APP_VERSION__);

// app.js — controller for Illara Governance Dashboard (Phase 2)
// REAL mode is live: Supabase-backed fetches + UI render pipeline.
// Fake/demo paths must not be reintroduced.

const USE_FAKE_DATA = false;
const DEBUG = false; // set true only when actively debugging

// Read any config injected by env.public.js (Supabase URL / anon key, etc.)
function getCfg() {
  const cfg =
    window.ILLARA_CFG ||
    window.ILLARA_ENV ||
    window.ENV_PUBLIC ||
    null;

  if (!cfg) {
    return { SUPABASE_URL: null, SUPABASE_ANON_KEY: null };
  }

  return {
    ...cfg,
    SUPABASE_URL: cfg.SUPABASE_URL || cfg.supabaseUrl || null,
    SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || null,
  };
}

// ---------------------------------------------------------------------
// 2) DOM helpers (summary cards + tables)
// ---------------------------------------------------------------------


function updateTrendSection(recentRuns) {
  const spark = document.getElementById("trendSpark");
  const caption = document.getElementById("trendCaption");

  UI.log("[APP] updateTrendSection(): enter", {
    hasSpark: !!spark,
    hasCaption: !!caption,
    isArray: Array.isArray(recentRuns),
    recentCount: Array.isArray(recentRuns) ? recentRuns.length : null,
  });

  // Guard: no DOM nodes
  if (!spark || !caption) {
    UI.log("[APP] updateTrendSection(): missing DOM nodes, aborting");
    return;
  }

  // Guard: no or too little data
  if (!Array.isArray(recentRuns) || recentRuns.length < 2) {
    spark.innerHTML = "";
    caption.textContent = "Trend: Not enough data to compute trend yet.";
    UI.log("[APP] updateTrendSection(): not enough recentRuns, aborting");
    return;
  }

  // Oldest → newest so the line flows left → right
      const runs = [...recentRuns].sort((a, b) => {
      const aTime = new Date(
        a.generated_at ||
          a.generatedAt ||
          a.time ||
          a.run_started_at ||
          a.created_at ||
          a.inserted_at ||
          0
      ).getTime();

      const bTime = new Date(
        b.generated_at ||
          b.generatedAt ||
          b.time ||
          b.run_started_at ||
          b.created_at ||
          b.inserted_at ||
          0
      ).getTime();

      return aTime - bTime;
    });

  // Try passRate (UI field); fall back to checks/failures
  const passRates = runs
    .map((run) => {
      if (typeof run.passRate === "number") {
        return run.passRate;
      }

      if (typeof run.checks === "number" && run.checks > 0) {
        const failures = typeof run.failures === "number" ? run.failures : 0;
        const passed = Math.max(0, run.checks - failures);
        return (passed / run.checks) * 100;
      }

      return null;
    })
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  UI.log("[APP] updateTrendSection(): computed passRates", {
    passRatesCount: passRates.length,
    passRatesSample: passRates.slice(0, 5),
  });

  // Guard: not enough numeric datapoints
  if (passRates.length < 2) {
    spark.innerHTML = "";
    caption.textContent = "Trend: Not enough data to compute trend yet.";
    UI.log("[APP] updateTrendSection(): not enough passRates, aborting");
    return;
  }

  // Cap to last N points so it stays readable
  const maxPoints = 20;
  const sliced =
    passRates.length > maxPoints
      ? passRates.slice(passRates.length - maxPoints)
      : passRates;

  const oldest = sliced[0];
  const newest = sliced[sliced.length - 1];
  const delta = newest - oldest;

  // Direction logic with small tolerance
  const threshold = 1; // 1 percentage point
  let direction = "flat";
  if (delta > threshold) direction = "up";
  else if (delta < -threshold) direction = "down";

  const descriptor =
    direction === "up"
      ? "improving"
      : direction === "down"
      ? "declining"
      : "stable";

  // SVG geometry
  const width = 100;
  const height = 40;
  const padding = 4;

  const max = Math.max(...sliced);
  const min = Math.min(...sliced);
  const span = max - min || 1;

  const pointsAttr = sliced
    .map((value, index) => {
      const x =
        sliced.length === 1
          ? width / 2
          : (index / (sliced.length - 1)) * (width - padding * 2) +
            padding;

      const normalized = (value - min) / span; // 0–1
      const y =
        height - padding - normalized * (height - padding * 2); // invert Y

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Draw the polyline
  spark.setAttribute("viewBox", `0 0 ${width} ${height}`);
  spark.innerHTML = `
    <polyline
      class="trend-line trend-line-${direction}"
      fill="none"
      points="${pointsAttr}"
    />
  `;

  // Caption text
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(
    1
  )} pts vs earliest run in window`;

  caption.textContent = `Trend: Pass rate ${descriptor} — current ${newest.toFixed(
    1
  )}% (${deltaText}, based on ${sliced.length} runs).`;

  UI.log("[APP] updateTrendSection(): updated DOM", {
    direction,
    newest,
    delta,
    count: sliced.length,
  });
}

function updateHarnessSection(latestRun, recentRuns) {
  const card = document.getElementById("harnessCard");
  const statusEl = document.getElementById("harnessStatus");
  const metaEl = document.getElementById("harnessMeta");
  const historyEl = document.getElementById("harnessHistory");

  if (!card) return;

  // --- No data yet ---
  if (!latestRun) {
    card.classList.remove("is-pass", "is-fail");
    if (statusEl) statusEl.textContent = "Status: —";
    if (metaEl) metaEl.textContent = "No harness runs recorded yet.";
    if (historyEl) historyEl.textContent = "Recent: —";
    return;
  }

  // --- Basic fields from latest run ---
  const status = (latestRun.overall_status ?? latestRun.status ?? "UNKNOWN").toUpperCase();
  const env = latestRun.environment || "unknown";
  const total = latestRun.total_checks ?? 0;
  const failed = latestRun.failed_checks ?? 0;

  // --- Convert timestamps to local time ---
  const startedLocal = latestRun.started_at
    ? new Date(latestRun.started_at).toLocaleString()
    : "—";
  const finishedLocal = latestRun.finished_at
    ? new Date(latestRun.finished_at).toLocaleString()
    : "—";

  // --- Card styling by status ---
  card.classList.remove("is-pass", "is-fail");
  if (status === "PASS") {
    card.classList.add("is-pass");
  } else if (status === "FAIL") {
    card.classList.add("is-fail");
  }

  // --- Main status line ---
  if (statusEl) {
    statusEl.textContent = `Status: ${status}`;
  }

  // --- Meta line (env, checks, timestamps) ---
  if (metaEl) {
    metaEl.textContent =
      `Env: ${env} • Checks: ${total}, Failed: ${failed}` +
      ` • Started: ${startedLocal} • Finished: ${finishedLocal}`;
  }

  // --- History line: last few harness runs ---
  if (historyEl) {
    let historyText = "Recent: —";

    if (Array.isArray(recentRuns) && recentRuns.length > 0) {
      const pieces = recentRuns.slice(0, 5).map((run) => {
        const t = run.started_at
          ? new Date(run.started_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        const s = (run.overall_status || "?").toUpperCase();
        return `${t} • ${s}`;
      });

      historyText = `Recent: ${pieces.join(" | ")}`;
    }

    historyEl.textContent = historyText;
  }
}

// ---------------------------------------------------------------------
// 4) Future: REAL mode (Supabase)
// ---------------------------------------------------------------------
//
// For now, we’re *not* calling Supabase from here — just wiring the
// structure so we can drop the real fetches in later.

async function runRealMode(cfg) {
  UI.log("runRealMode()", cfg);

  // Placeholder: when we wire Supabase, we’ll:
  //   1. fetch summary metrics
  //   2. fetch recent runs
  //   3. fetch failures (flat)
  //
  // For now, just fall back to FAKE so the UI shows something.
  clearDashboardUI("REAL mode only: runRealMode() placeholder hit");
}

// Shared Supabase fetch helper for REAL mode
async function safeSupabaseFetch(label, url, cfg) {
  UI.log("[APP][SUPABASE] starting", { label, url });

  const key = String(cfg?.SUPABASE_ANON_KEY || "");
  const keyTrim = key.trim();

  UI.log("[APP][SUPABASE] key check", {
    label,
    key_len: keyTrim.length,
    key_head: keyTrim.slice(0, 16),
    key_tail: keyTrim.slice(-10),
    has_newline: keyTrim.includes("\n"),
    has_quote: keyTrim.includes('"') || keyTrim.includes("'"),
    supabase_url: cfg?.SUPABASE_URL,
  });

  if (!keyTrim.startsWith("eyJ")) {
    UI.warn("[APP][SUPABASE] Missing/invalid SUPABASE_ANON_KEY for REST", {
      label,
      key_head: keyTrim.slice(0, 20),
      key_len: keyTrim.length,
    });
    return [];
  }

  try {
        const res = await fetch(url, {
      headers: {
        apikey: keyTrim,
        Authorization: `Bearer ${keyTrim}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      UI.warn("[APP][SUPABASE] non-OK response", {
        label,
        status: res.status,
        url,
        body: text,
      });
      return [];
    }

    const json = await res.json();

    if (!Array.isArray(json)) {
      UI.warn("[APP][SUPABASE] JSON was not an array", {
        label,
        json,
      });
      return [];
    }

    if (DEBUG) UI.log("[APP][SUPABASE] rows", {
      label,
      count: json.length,
      sample: json.slice(0, 3),
    });

    return json;
  } catch (err) {
    UI.error("[APP][SUPABASE] fetch error", { label, url, err });
    return [];
  }
}

// Recent Actions — from repair_action_runs_recent_v1
function fetchRecentActionsFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/repair_action_runs_recent_v1` +
    `?select=*` +
    `&order=requested_at.desc` +
    `&limit=10`;

  return safeSupabaseFetch("repair_action_runs_recent_v1", url, cfg);
}

// Main dashboard summary — public_governance_recent
async function fetchSummaryFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/public_governance_recent?select=*`;
  return safeSupabaseFetch("public_governance_recent", url, cfg);
}

// Main dashboard "Recent Runs" --- use public_governance_recent
async function fetchRecentRunsFromSupabase(cfg, selectedPhase) {
  selectedPhase = selectedPhase || "harness";
  let url =
    `${cfg.SUPABASE_URL}/rest/v1/public_governance_recent` +
    `?select=*` +
    `&order=generated_at.desc` +
    `&limit=50`;

  // Option A: Phase scope
  if (selectedPhase && selectedPhase !== "all") {
    url += `&phase=eq.${encodeURIComponent(selectedPhase)}`;
  }

  return safeSupabaseFetch("public_governance_recent", url, cfg);
}

// Demo Service health checks — optional feature (opt-in)
async function fetchDemoServiceChecksFromSupabase(cfg) {
  if (!cfg || cfg.DEMO_SERVICE_ENABLED !== true) {
    // Returning null lets the UI show "disabled" (with our hardened ui.js)
    UI.log("[APP] Demo service disabled; skipping fetch");
    return null;
  }

  // 1) Preferred: a dedicated view/table if present (optional future)
  try {
    const recentUrl =
      `${cfg.SUPABASE_URL}/rest/v1/demo_service_recent` +
      `?select=*` +
      `&order=created_at.desc` +
      `&limit=10`;

    const recentRows = await safeSupabaseFetch("demo_service_recent", recentUrl, cfg);

    if (Array.isArray(recentRows) && recentRows.length > 0) {
      return recentRows;
    }
  } catch (e) {
    // safeSupabaseFetch should already log; swallow and fall back
  }

  // 2) Fallback: demo checks embedded in test_checks via DEMO_HEALTH_* prefix
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?select=*` +
    `&check_name=like.DEMO_HEALTH_%25` + // %25 => wildcard %
    `&order=created_at.desc` +
    `&limit=10`;

  return safeSupabaseFetch("demo_service_checks", url, cfg);
}

// Demo Service health -- demo_service_recent
async function fetchDemoServiceRecentFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/demo_service_recent?select=*`;
  return safeSupabaseFetch("demo_service_recent", url, cfg);
}

// --- Demo Service health checks (from test_checks) ---
async function fetchDemoHealthChecksFromSupabase(cfg) {
  // Grab the last few DEMO_HEALTH_* checks
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?check_name=like.DEMO_HEALTH_%25&order=created_at.desc&limit=5`;

  return safeSupabaseFetch("demo_health_checks", url, cfg);
}


async function fetchDemoHealthChecksForRunFromSupabase(cfg, runId) {
  if (!runId) {
    UI.warn(
      "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): missing runId",
      { runId }
    );
    return [];
  }

  const idNum = Number(runId);
if (!Number.isFinite(idNum)) {
  UI.warn("[DEMO] fetchDemoHealthChecksForRunFromSupabase(): runId not numeric; skipping", { runId });
  return [];
}

  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?run_id=eq.${encodeURIComponent(idNum)}` +
    `&order=created_at.asc`;

  UI.log("[DEMO] fetchDemoHealthChecksForRunFromSupabase(): starting", { url });

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SB_PUBLISHABLE_KEY,
        Authorization: `Bearer ${cfg.SB_PUBLISHABLE_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    if (DEBUG) UI.log(
      "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): rows",
      { count: rows.length, sample: rows.slice(0, 3) }
    );

    // Only keep the demo_service_health checks
    return rows.filter(
      (r) => r.details && r.details.source === "demo_service_health"
    );
  } catch (err) {
    UI.error("[DEMO] fetchDemoHealthChecksForRunFromSupabase(): error", err);
    return [];
  }
}

async function fetchFailuresFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/public_governance_failures_flat` +
    `?select=run_id,phase,principle,rule,severity,message,generated_at` +
    `&order=generated_at.desc` +
    `&limit=100`;

    const rows = await safeSupabaseFetch("public_governance_failures_flat", url, cfg);

  // Fix Option A:
  // Drop “empty” rows that come back from the view when there’s no failure detail
  // (these show up as blank Principle/Rule/Severity/Message in the table)
  if (!Array.isArray(rows)) return [];

  return rows.filter((r) => {
    const hasFailureDetail =
      (typeof r?.rule === "string" && r.rule.length > 0) ||
      (typeof r?.message === "string" && r.message.length > 0) ||
      (typeof r?.principle === "string" && r.principle.length > 0) ||
      (typeof r?.severity === "string" && r.severity.length > 0);
    return hasFailureDetail;
  });
}

async function fetchFailuresForRunFromSupabase(cfg, runId) {
  // HARD GUARD: public_governance_failures_flat.run_id is BIGINT, so only allow numbers.
  const idNum = Number(runId);
  if (!Number.isFinite(idNum)) {
    UI.warn("[APP] fetchFailuresForRunFromSupabase(): runId is not numeric; skipping", { runId });
    return [];
  }

  const url =
    `${cfg.SUPABASE_URL}/rest/v1/public_governance_failures_flat` +
`?select=generated_at,phase,principle,rule,severity,message` +
`&order=generated_at.desc&limit=100`;

  return safeSupabaseFetch("governance_failures_for_run", url, cfg);
}

async function triggerHarnessRun(cfg) {
  const url = `${cfg.SUPABASE_URL}/functions/v1/run-harness`;

  // Edge Functions require a real JWT (anon key: eyJ...).
  // Do NOT use sb_publishable_... here.
  const jwt = String(cfg?.SUPABASE_ANON_KEY || "").trim();

  UI.log("[HARNESS] triggerHarnessRun(): calling Edge Function", {
    url,
    jwt_len: jwt.length,
    jwt_head: jwt.slice(0, 12),
  });

  if (!jwt || !jwt.startsWith("eyJ")) {
    UI.warn("[HARNESS] Missing/invalid SUPABASE_ANON_KEY for Edge Function call", {
      jwt_len: jwt.length,
      jwt_head: jwt.slice(0, 20),
      hint: "SUPABASE_ANON_KEY must be the legacy anon JWT that starts with 'eyJ...'",
    });
    throw new Error("Cannot call run-harness: invalid SUPABASE_ANON_KEY (expected eyJ...)");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ source: "dashboard" }),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    UI.warn("[HARNESS] triggerHarnessRun(): Edge Function error", {
      status: res.status,
      text,
    });
    throw new Error(`run-harness failed: ${res.status} ${text}`);
  }

  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  UI.log("[HARNESS] triggerHarnessRun(): Edge Function OK", data);
  return data;
}

async function triggerFailureWindowRecompute(cfg) {
  const url = `${cfg.SUPABASE_URL}/functions/v1/recompute_failure_window_v1`;

  UI.log("[WINDOW] triggerFailureWindowRecompute(): calling Edge Function", {
    url,
    jwt_len: String(cfg?.SUPABASE_ANON_KEY || "").length,
    jwt_head: String(cfg?.SUPABASE_ANON_KEY || "").slice(0, 12),
  });

  const jwt = String(cfg?.SUPABASE_ANON_KEY || "").trim();
  if (!jwt || !jwt.startsWith("eyJ")) {
    UI.warn("[WINDOW] Missing/invalid SUPABASE_ANON_KEY; cannot recompute window", {
      jwt_len: jwt.length,
      jwt_head: jwt.slice(0, 12),
    });
    return null;
  }

  const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
    Authorization: `Bearer ${jwt}`,
  },
  body: JSON.stringify({ source: "dashboard" }),
});

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    UI.warn("[WINDOW] triggerFailureWindowRecompute(): Edge Function error", {
      status: res.status,
      text,
    });
    return null;
  }

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }

  UI.log("[WINDOW] triggerFailureWindowRecompute(): Edge Function OK", data);
  return data;
}

// ---------------------------------------------------------
// Summary helpers (rows -> metrics)
// ---------------------------------------------------------


function updateDemoHealthLine(rows) {
  const el = document.getElementById("demoHealth");
  if (!el) return;

  if (!rows || rows.length === 0) {
    el.textContent = "Demo service: —";
    return;
  }

  const total = rows.length;
  const failed = rows.filter((r) => r.status === "FAIL").length;

  const durations = rows
    .map((r) => r.duration_ms)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  const avgMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  if (failed === 0) {
    const base = `Demo service: PASS (${total}/${total} checks`;
    el.textContent =
      avgMs != null ? `${base}, ~${avgMs}ms)` : `${base})`;
  } else {
    el.textContent = `Demo service: FAIL (${failed}/${total} checks failed)`;
  }
}

function fmtTime(value) {
  if (value == null || value === "") return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value); // fallback
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ---------------------------------------------------------
// Mapping helpers: Supabase rows -> UI shapes
// ---------------------------------------------------------

// Derive summary stats from UI-mapped runs + failures
function buildSummaryFromRows(runs, failures) {

  // Ensure we always work with arrays
  const safeRuns = Array.isArray(runs) ? runs : [];
  const safeFailures = Array.isArray(failures) ? failures : [];

  // Window metrics
  const runsInWindow = safeRuns.length;
  const failuresInWindow = safeFailures.length;

  // Unique rules across all failures
  const uniqueRules = new Set(
    safeFailures
      .map((f) => f.rule)
      .filter((rule) => typeof rule === "string" && rule.length > 0)
  ).size;

  // Pass-rate = (# runs with 0 failures) / (total runs)
  let passRate = 0;
  if (runsInWindow > 0) {
    const passedRuns = safeRuns.filter((run) => {
      const failuresCount =
        typeof run.failures === "number" ? run.failures : 0;
      return failuresCount === 0;
    }).length;

    passRate = passedRuns / runsInWindow; // 0–1
  }

  // Last run time: first run in the mapped array, if present
  const lastRunAt =
    safeRuns.length > 0 && safeRuns[0].time ? safeRuns[0].time : null;

  const summary = {
    runsInWindow,
    failuresInWindow,
    uniqueRules,
    passRate,
    lastRunAt,
  };

  UI.log("[APP] buildSummaryFromRows()", summary);
  return summary;
}

function mapRecentRunRow(row) {
  const mapped = {
    time: fmtTime(
      row.time ??
      row.generated_at ??
      row.started_at ??
      row.run_time ??
      row.created_at ??
      null
    ),

    // Raw timestamp for window filtering (do not format)
    time_raw:
      row.time ??
      row.generated_at ??
      row.started_at ??
      row.run_time ??
      row.created_at ??
      null,

    runId: (() => {
      const v = row.run_id ?? row.runId ?? null; // NEVER row.id
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })(),

    phase:
      row.phase ??
      row.stage ??
      "",
    checks:
      row.checks ??
      row.total_checks ??
      row.check_count ??
      0,
    failures:
      row.failures ??
      row.failure_count ??
      0,
    status:
      row.status ??
      row.result ??
      "",
  };

  return mapped;
}

function mapFailureRow(row) {
    const mapped = {
    time: fmtTime(
      row.time ??
      row.generated_at ??
      row.failure_time ??
      row.started_at ??
      row.created_at ??
      null
    ),

    time_raw:
      row.time ??
      row.generated_at ??
      row.failure_time ??
      row.started_at ??
      row.created_at ??
      null,

          runId: (() => {
        const v = row.run_id ?? row.runId ?? null; // NEVER row.id
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),

    phase:
      row.phase ??
      row.stage ??
      "",
    principle:
      row.principle ??
      row.charter_principle ??
      "",
    rule:
      row.rule ??
      row.rule_code ??
      "",
    severity:
      row.severity ??
      row.level ??
      "",
    message:
      row.message ??
      row.details ??
      row.description ??
      "",
  };

  return mapped;
}

function clearDashboardUI(reason) {
  UI.warn("[APP] clearDashboardUI()", reason);

  if (typeof window.updateSummaryCards === "function") window.updateSummaryCards(null);
  if (typeof window.updateRecentRunsTable === "function") window.updateRecentRunsTable([]);
  if (typeof window.updateFailuresTable === "function") window.updateFailuresTable([]);
  if (typeof window.updateRecentActionsTable === "function") window.updateRecentActionsTable([]);

  updateHarnessSection(null, []);
  setHarnessWhyBlock(null, "");
}

// --- Phase filter state (UI-only, safe) ---
let selectedPhase = localStorage.getItem("illara_phase") || "__all";

function bindPhaseFilter(onChange) {
  const el = document.getElementById("phaseFilter");
  if (!el) return;

  el.value = selectedPhase;

  el.addEventListener("change", () => {
    selectedPhase = el.value || "__all";
    localStorage.setItem("illara_phase", selectedPhase);
    if (typeof onChange === "function") onChange();
  });
}

function applyPhaseFilter(rows) {
  if (!Array.isArray(rows)) return rows;
  if (!selectedPhase || selectedPhase === "__all") return rows;
  return rows.filter(r => (r.phase || "").toLowerCase() === selectedPhase);
}

// ---- Window filter state (UI-only, safe) ----
let selectedWindow = localStorage.getItem("illara_window") || "7d"; // default matches your HTML selected

function bindWindowFilter(onChange) {
  const el = document.getElementById("windowFilter");
  if (!el) return;

  el.value = selectedWindow;

  el.addEventListener("change", () => {
    selectedWindow = el.value || "7d";
    localStorage.setItem("illara_window", selectedWindow);
    if (typeof onChange === "function") onChange();
  });
}

// expects rows to have a date-like field (generated_at/created_at/time/etc.)
function applyWindowFilter(rows) {
  if (!Array.isArray(rows)) return rows;
  if (!selectedWindow || selectedWindow === "all") return rows;

  const now = Date.now();

  let ms;
  if (selectedWindow === "24h") ms = 24 * 60 * 60 * 1000;
  else if (selectedWindow === "7d") ms = 7 * 24 * 60 * 60 * 1000;
  else if (selectedWindow === "30d") ms = 30 * 24 * 60 * 60 * 1000;
  else return rows;

  const cutoff = now - ms;

  // Try common timestamp fields. Adjust if needed.
  return rows.filter(r => {
    const t =
      r.time_raw ||
      r.generated_at ||
      r.generatedAt ||
      r.created_at ||
      r.createdAt ||
      r.time ||
      r.ts ||
      r.timestamp;

    const d = t ? new Date(t).getTime() : NaN;
    return Number.isFinite(d) && d >= cutoff;
  });
}

// ---- Principle filter state (UI-only, safe) ----
let selectedPrinciple = localStorage.getItem("illara_principle") || "__all";

function bindPrincipleFilter(onChange) {
  const el = document.getElementById("principleFilter");
  if (!el) return;

  el.value = selectedPrinciple;

  el.addEventListener("change", () => {
    selectedPrinciple = el.value || "__all";
    localStorage.setItem("illara_principle", selectedPrinciple);
    if (typeof onChange === "function") onChange();
  });
}

function applyPrincipleFilter(rows) {
  if (!Array.isArray(rows)) return rows;
  if (!selectedPrinciple || selectedPrinciple === "__all") return rows;

  // failures rows use "principle" (e.g., INTEGRITY). We normalize both sides.
  const want = String(selectedPrinciple).toUpperCase();
  return rows.filter(r => String(r.principle || "").toUpperCase() === want);
}

// Main loader: fetch REAL data (or fall-back)
async function loadDashboard() {
  const cfg = getCfg();
  const hasCfg = !!(cfg && cfg.SUPABASE_ANON_KEY);

  UI.log("[APP] loadDashboard(): starting", {
    mode: hasCfg ? "REAL" : "FAKE",
    hasCfg,
    cfg,
  });

  let lastUpdated = null;

  // If we don't have Supabase config, fall back to fake mode
  if (!hasCfg) {
    UI.error("[APP] Missing Supabase config; falling back back to FAKE mode");
    clearDashboardUI("REAL mode fallback hit");
    updateSummaryStatus(new Date());
    return;
  }

  try {
    // 1) Pull REAL data from Supabase in parallel
    const [
  summaryRows,
  recentRunRows,
  failureRows,
  demoServiceRows,
  actionRows,
] = await Promise.all([
  fetchSummaryFromSupabase(cfg),
  fetchRecentRunsFromSupabase(cfg, "harness"),
  fetchFailuresFromSupabase(cfg),
  fetchDemoServiceChecksFromSupabase(cfg),
  fetchRecentActionsFromSupabase(cfg),
]);

  if (DEBUG) UI.log("[APP] REAL summary rows", summaryRows);
  if (DEBUG) UI.log("[APP] REAL recent runs rows", recentRunRows);
  if (DEBUG) UI.log("[APP] REAL failures rows", failureRows);
  if (DEBUG) UI.log("[APP] REAL demo service rows", demoServiceRows);
  if (DEBUG) UI.log("[APP] REAL actions rows", actionRows);
  if (DEBUG) UI.log("[APP] REAL actions rows (sample)", {
  count: Array.isArray(actionRows) ? actionRows.length : null,
  sample: Array.isArray(actionRows) ? actionRows.slice(0, 3) : actionRows,
});

      // 2) Map Supabase rows --> UI shapes (canonical mappers)
      const runsUI = (Array.isArray(recentRunRows) ? recentRunRows : [])
        .map(mapRecentRunRow)
        .filter(Boolean);

      const failuresUI = (Array.isArray(failureRows) ? failureRows : [])
        .map(mapFailureRow)
        .filter(Boolean);

        // Phase filter (apply to UI-shaped rows)
      const runsUIFiltered =
        applyWindowFilter(applyPhaseFilter(runsUI));

      const failuresUIFiltered =
        applyPrincipleFilter(applyWindowFilter(applyPhaseFilter(failuresUI)));

      if (DEBUG) UI.log("[APP] mapped runsUI", {
        count: runsUI.length,
        sample: runsUI.slice(0, 3),
      });

      if (DEBUG) UI.log("[APP] mapped failuresUI", {
        count: failuresUI.length,
        sample: failuresUI.slice(0, 3),
      });

      // 3) Build window aggregates from the SAME objects we render
      const summary = buildSummaryFromRows(runsUIFiltered, failuresUIFiltered);

      // 4) Derive "last updated" time (dashboard refresh time)
      lastUpdated = new Date();

      // 5) Push REAL data into the UI
      if (typeof window.updateSummaryCards === "function") window.updateSummaryCards(summary);
      if (typeof window.updateRecentRunsTable === "function") window.updateRecentRunsTable(runsUIFiltered);
      if (typeof window.updateFailuresTable === "function") window.updateFailuresTable(failuresUIFiltered);

      updateRecentActionsTable(actionRows);

    // NEW: update the Demo service line on the harness card
    if (UI.updateDemoServiceMeta) {
      UI.updateDemoServiceMeta(demoServiceRows);
    }

    // NEW: Trend wiring
    UI.log("[APP] loadDashboard(): calling updateTrendSection()", {
  recentRunsCount: runsUIFiltered.length,
});

updateTrendSection(runsUIFiltered);

UI.log("[APP] updateSummaryStatus() success path", { lastUpdated });
} catch (err) {
  UI.error("[APP] REAL mode failed; falling back back to FAKE mode", err);

  // Fall back to fake mode, but keep the page usable
  clearDashboardUI("REAL mode fallback hit");
}

// Final: update the "Last updated" pill
updateSummaryStatus(lastUpdated);
}

// Expose helpers for debugging from the console
window.UI = UI;
window.loadDashboard = loadDashboard;

// Helper to update the refresh button visual state
function setRefreshButtonState(btn, state) {
  if (!btn) return;

  // Clear all state classes first
  btn.classList.remove("is-loading", "is-success", "is-error");

  if (state === "loading") {
    btn.classList.add("is-loading");
    btn.disabled = true;
  } else if (state === "success") {
    btn.classList.add("is-success");
    btn.disabled = false;
  } else if (state === "error") {
    btn.classList.add("is-error");
    btn.disabled = false;
  } else {
    // "idle" / default
    btn.disabled = false;
  }
}

function applyHarnessRepairStatusFromTruth(latestHarnessRun, actionRows) {
  // Prefer the function you added in ui.js (exposed on window if you did that)
  const setLine =
    (typeof window.setHarnessRepairStatus === "function" && window.setHarnessRepairStatus) ||
    null;

  if (!setLine) return;

  if (!latestHarnessRun) {
    setLine(null);
    return;
  }

  const status = String(latestHarnessRun.overall_status || "").toUpperCase();

  // PASS => hide
  if (status === "PASS") {
    setLine(null);
    return;
  }

  // FAIL => show based on newest action row
  if (status === "FAIL") {
    const newest = Array.isArray(actionRows) ? actionRows[0] : null;

    const isPendingRepair =
      newest &&
      String(newest.action_type || "").toUpperCase() === "AUTO_REPAIR" &&
      String(newest.approval_status || "").toUpperCase() === "PENDING"


    if (isPendingRepair) {
      setLine("🟡 Repair request created — pending approval");
    } else {
      setLine("🔴 Harness failed — no pending repair request visible");
    }
    return;
  }

  // Any other state (PENDING/UNKNOWN) => hide for now
  setLine(null);
}

async function fetchLatestHarnessGovernanceRunIdFromSupabase(cfg) {
  // Pull the newest governance run for phase=harness (run_id is BIGINT)
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/public_governance_recent` +
    `?select=run_id,phase,generated_at` +
    `&phase=eq.harness` +
    `&order=generated_at.desc` +
    `&limit=1`;

  const rows = await safeSupabaseFetch("latest_harness_governance_run", url, cfg);
  const r = Array.isArray(rows) ? rows[0] : null;

  const runId = Number(r && r.run_id);
  return Number.isFinite(runId) ? runId : null;
}

// === HARNESS: fetch latest run (public_harness_recent) ===
async function fetchHarnessLatestRunFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/public_harness_recent` +
    `?select=run_id,started_at,finished_at,overall_status,total_checks,failed_checks,failure_severity` +
    `&order=started_at.desc&limit=1`;

  const rows = await safeSupabaseFetch("public_harness_recent(latest)", url, cfg);
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

// === HARNESS: fetch last few runs for history line ===
async function fetchHarnessRecentRunsFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/public_harness_recent` +
    `?select=run_id,started_at,finished_at,overall_status` +
    `&order=started_at.desc&limit=5`;

  const rows = await safeSupabaseFetch("public_harness_recent(recent)", url, cfg);
  return Array.isArray(rows) ? rows : [];
}

// === HARNESS: manual refresh helper ===
async function refreshHarnessOnly() {
  const btn = document.getElementById("harnessRefreshBtn");
  if (!btn) return { latestHarnessRun: null, recentHarnessRuns: [] };

  setRefreshButtonState(btn, "loading");

  try {
    const cfg = getCfg();

    const latestHarnessRun = await fetchHarnessLatestRunFromSupabase(cfg);
    const recentHarnessRuns = await fetchHarnessRecentRunsFromSupabase(cfg);

    updateHarnessSection(latestHarnessRun, recentHarnessRuns);

    // 5) Why block (on FAIL) — pull failures using governance BIGINT run_id
try {
  const status = String(latestHarnessRun?.overall_status || "").toUpperCase();
  if (status === "FAIL") {
    const govRunId = await fetchLatestHarnessGovernanceRunIdFromSupabase(cfg);
    if (!govRunId) {
      setHarnessWhyBlock(null, "");
    } else {
      const failureRows = await fetchFailuresForRunFromSupabase(cfg, govRunId);
      setHarnessWhyBlock("Why it failed", buildHarnessWhyText(failureRows));
    }
  } else {
    setHarnessWhyBlock(null, "");
  }
} catch (_) {
  setHarnessWhyBlock(null, "");
}

    if (typeof window.updateDemoServiceMeta === "function") {
      window.updateDemoServiceMeta([]);
    }

    setRefreshButtonState(btn, "success");

    // ✅ return AFTER success state work
    return { latestHarnessRun, recentHarnessRuns };
  } catch (err) {
    UI.error("[HARNESS] manual refresh failed", err);

    updateHarnessSection(null, []);
    setHarnessWhyBlock(null, "");

    if (typeof window.updateDemoServiceMeta === "function") {
      window.updateDemoServiceMeta([]);
    }

    setRefreshButtonState(btn, "error");

    // ✅ required error-path return
    return { latestHarnessRun: null, recentHarnessRuns: [] };
  } finally {
    setTimeout(() => {
      setRefreshButtonState(btn, "idle");
    }, 1200);
  }
}

function setHarnessWhyBlock(titleText, bodyText) {
  const block = document.getElementById("harnessWhyBlock");
  const title = document.getElementById("harnessWhyTitle");
  const body  = document.getElementById("harnessWhyBody");
  if (!block || !title || !body) return;

  if (!bodyText) {
    block.style.display = "none";
    title.textContent = "Why:";
    body.textContent = "";
    return;
  }

  block.style.display = "block";
  title.textContent = titleText || "Why:";
  body.textContent = bodyText;
}

function buildHarnessWhyText(failureRows) {
  const rows = Array.isArray(failureRows) ? failureRows : [];
  if (rows.length === 0) return "";

  // Take top 3 (already ordered by severity in your fetch)
  const top = rows.slice(0, 3).map((r) => {
    const phase = (r.phase ?? "—").toString();
    const principle = (r.principle ?? "—").toString();
    const rule = (r.rule ?? "—").toString();
    const sev = ((r.severity ?? "—").toString()).toUpperCase();
    const msg = (r.message ?? "—").toString().trim();

    const shortMsg = msg.length > 140 ? msg.slice(0, 140) + "…" : msg;

    // Example:
    // [RUNTIME • HIGH] Principle → Rule: message…
    return `[${phase.toUpperCase()} • ${sev}] ${principle} → ${rule}: ${shortMsg}`;
  });

  // One per line for readability
  return top.join("\n");
}

// Kick off once the page is ready
window.addEventListener("load", () => {
  const refreshBtn = document.getElementById("refreshBtn");

  // NEW: wire the Test Harness "Re-check" button
  const harnessBtn = document.getElementById("harnessRefreshBtn");
  if (harnessBtn) {
    UI.log("[HARNESS] wiring harnessRefreshBtn click handler", {
      hasHarnessBtn: true,
    });
    harnessBtn.addEventListener("click", async () => {
  // Prevent double-click / spam
  if (harnessBtn.disabled) return;
  harnessBtn.disabled = true;

  const cfg = getCfg(); // <-- keep cfg in scope for both try + catch

  try {
    // 1) Trigger a new run row
    await triggerHarnessRun(cfg);

    // 1b) Recompute the failure window cache (public-safe)
    await triggerFailureWindowRecompute(cfg);

    // 2) Refresh harness (and get latest run back)
    const { latestHarnessRun } = await refreshHarnessOnly();

    // 3) Refresh Recent Actions immediately (Option A)
    const actionRows = await fetchRecentActionsFromSupabase(cfg);
    updateRecentActionsTable(actionRows);

    await loadDashboard();

    // 4) Set the harness repair status line from auditable truth (Option A)
    applyHarnessRepairStatusFromTruth(latestHarnessRun, actionRows);

    UI.log("[HARNESS] Re-check: triggered new run + refreshed");
  } catch (e) {
    UI.error("[HARNESS] Re-check failed to trigger run", e);

    // Still refresh so user sees current state + status line
    try {

      // INSURANCE: attempt recompute even if the main flow failed mid-way
     await triggerFailureWindowRecompute(cfg).catch(() => {});

      const { latestHarnessRun } = await refreshHarnessOnly();
      const actionRows = await fetchRecentActionsFromSupabase(cfg);
      updateRecentActionsTable(actionRows);
      applyHarnessRepairStatusFromTruth(latestHarnessRun, actionRows);
    } catch (e2) { UI.log("[HARNESS] fallback refresh failed", e2); }
  } finally {
    // Re-enable button
    harnessBtn.disabled = false;
  }
});

  } else {
    UI.log("[HARNESS] no harnessRefreshBtn found on page", {
      hasHarnessBtn: false,
    });
  }

  bindPhaseFilter(() => loadDashboard());
  bindPrincipleFilter(() => loadDashboard());
  bindWindowFilter(() => loadDashboard());

  // Initial load — let loadDashboard handle most errors,
  // but still guard against unexpected ones.
  loadDashboard()
    .catch((e) => {
      UI.error("[APP] Dashboard load error:", e);
    });

  // Wire up the Refresh button, if present
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      UI.log("[APP] Manual refresh clicked");
      setRefreshButtonState(refreshBtn, "loading");

      loadDashboard()
        .then(() => {
          setRefreshButtonState(refreshBtn, "success");
          // Let the green state linger briefly, then return to idle
          setTimeout(() => setRefreshButtonState(refreshBtn, "idle"), 700);
        })
        .catch((err) => {
          UI.error("[APP] Manual refresh failed:", err);
          setRefreshButtonState(refreshBtn, "error");
          // After showing red, go back to idle so user can try again
          setTimeout(() => setRefreshButtonState(refreshBtn, "idle"), 2100);
        });
    });
  }
});







