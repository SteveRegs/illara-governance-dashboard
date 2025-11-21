// ui.js — Phase 2 minimal fake-data UI (v20251120-1)

// --- Filter state -----------------------------------------------------------
const FILTERS = { phase: "all", principle: "all", range: "7d" };
const METRIC_WINDOW_DAYS = 7;

// true  = use hard-coded fake data
// false = use real Supabase data (later)
const USE_FAKE_DATA = true;

// --- Public API -------------------------------------------------------------

export async function loadDashboard() {
  console.log("[UI] loadDashboard(): starting", {
    mode: USE_FAKE_DATA ? "FAKE" : "REAL",
  });

  // FAKE MODE: prove the UI wiring works without touching Supabase yet
  if (USE_FAKE_DATA) {
    const fakeSummary = {
      runsInWindow: 12,
      passRate: 0.83,
      failuresInWindow: 3,
      uniqueRules: 2,
    };

    const fakeRuns = [
      {
        time: "2025-11-18 09:00",
        runId: "RUN-001",
        phase: "pre-flight",
        checks: 10,
        failures: 1,
        status: "ok",
      },
      {
        time: "2025-11-18 12:30",
        runId: "RUN-002",
        phase: "runtime",
        checks: 14,
        failures: 0,
        status: "ok",
      },
    ];

    const fakeFailures = [
      {
        time: "2025-11-18 12:32",
        runId: "RUN-002",
        phase: "runtime",
        principle: "Integrity",
        rule: "EDR-001",
        severity: "high",
        message: "Example failure message.",
      },
      {
        time: "2025-11-18 12:32",
        runId: "RUN-002",
        phase: "runtime",
        principle: "Clarity",
        rule: "PROMPT-007",
        severity: "low",
        message: "Another example failure.",
      },
    ];

    console.log("[UI] FAKE summary metrics", fakeSummary);
    console.log("[UI] FAKE recent runs", fakeRuns);
    console.log("[UI] FAKE flat failures", fakeFailures);

    // 👉 Wire fake summary into the top cards
    updateSummaryCards(fakeSummary);

    // (We can later add helpers to paint fakeRuns/fakeFailures into the tables)
    return; // IMPORTANT: do not fall through to real Supabase path yet
  }

  // --- REAL MODE (disabled for now) ----------------------------------------
  // Once we’re ready to talk to Supabase again, we’ll replace the fake block
  // above with something like:
  //
  // try {
  //   await Promise.all([
  //     loadSummaryMetricsFromSupabase(),
  //     loadRecentRunsTableFromSupabase(),
  //     loadFailuresFlatFromSupabase(),
  //   ]);
  // } catch (e) {
  //   console.error("[UI] loadDashboard() failed:", e);
  //   throw e;
  // }
}

// Simple filter wiring – for now we just reload the dashboard when a filter changes
export function setFilterOptions(key, value) {
  FILTERS[key] = value;
  loadDashboard();
}

export function getFilterOptions() {
  return { ...FILTERS };
}

// ----- Internal helpers: config + headers -----------------------------------

export function getCfg() {
  // Look for any of our known config containers
  const cfg =
    window.ILLARA_CFG ||
    window.ILLARA_ENV ||
    window.ENV ||
    window.ENV_PUBLIC ||
    null;

  console.log("[UI] getCfg(): raw cfg", {
    hasCfg: !!cfg,
    keys: cfg ? Object.keys(cfg) : [],
  });

  if (!cfg) {
    console.warn("[UI] Supabase config missing – using empty cfg");
    return {
      SUPABASE_URL: null,
      SUPABASE_ANON_KEY: null,
    };
  }

  // Normalise URL / anon key from a few possible shapes
  const url =
    cfg.SUPABASE_URL ||
    cfg.supabaseUrl ||
    cfg.supabase_url ||
    null;

  const anonKey =
    cfg.SUPABASE_ANON_KEY ||
    cfg.supabaseAnonKey ||
    cfg.supabase_anon_key ||
    null;

  console.log("[UI] getCfg(): resolved URL / anonKey present?", !!url, !!anonKey);

  return {
    ...cfg,
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
  };
}

// Expose for any legacy callers that expect a global
if (typeof window !== "undefined") {
  window.getCfg = getCfg;
}

// --- DOM helpers -----------------------------------------------------------

function updateSummaryCards(summary) {
  const runsEl = document.getElementById("runsCount");
  const passRateEl = document.getElementById("passRatePill");
  const failCountEl = document.getElementById("failCount");
  const uniqueRulesEl = document.getElementById("uniqueRules");

  if (runsEl) {
    runsEl.textContent = String(summary.runsInWindow ?? "—");
  }

  if (passRateEl) {
    const pct =
      summary.passRate != null
        ? Math.round(summary.passRate * 100) + "%"
        : "—";
    passRateEl.textContent = `Pass rate: ${pct}`;
  }

  if (failCountEl) {
    failCountEl.textContent = String(summary.failuresInWindow ?? "0");
  }

  if (uniqueRulesEl) {
    uniqueRulesEl.textContent = `${summary.uniqueRules ?? 0} unique rules`;
  }
}
