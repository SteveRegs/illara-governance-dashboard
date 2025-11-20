// ui.js — plain script (ESM), TEMP fake mode + config helper

console.log("[UI] ui.js script loaded");

// ----- Filter state (still simple for now) ------------------------------
const FILTERS = { phase: "all", principle: "all", range: "7d" };
const METRIC_WINDOW_DAYS = 7;
// TEMP: toggle for debugging vs real Supabase
// true  = use hard-coded fake data
// false = use real Supabase data (once wired)
const USE_FAKE_DATA = true;

// ----- Public API ------------------------------------------------------------
export async function loadDashboard() {
  const cfg = getCfg();

  console.log("[UI] loadDashboard(): starting", {
    mode: USE_FAKE_DATA ? "FAKE" : "REAL",
    hasCfg: !!cfg,
    keys: cfg ? Object.keys(cfg) : [],
  });

  // --- FAKE MODE: hard-coded data so we can prove the UI JS is running ------
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

    // Update the top summary cards with fake data
updateSummaryCards(fakeSummary);

    // ⬆ For now we're just logging. Later we'll wire these into the DOM.
    return; // IMPORTANT: don't fall through to real Supabase path yet
  }

  // --- REAL MODE: this stays commented until we're ready to wire Supabase ---
  /*
  try {
    await Promise.all([
      loadSummaryMetrics(cfg),
      loadRecentRunsTable(cfg),
      tryFailuresFlat(cfg),
    ]);
  } catch (e) {
    console.error("[UI] loadDashboard() failed:", e);
    throw e;
  }
  */
}

function updateSummaryCards(summary) {
  console.log("[UI] updateSummaryCards(): called with", summary);

  const runsEl = document.getElementById("runsCount");
  const passRateEl = document.getElementById("passRatePill");
  const failCountEl = document.getElementById("failCount");
  const uniqueRulesEl = document.getElementById("uniqueRules");

  console.log("[UI] updateSummaryCards(): DOM elements", {
    runsEl: !!runsEl,
    passRateEl: !!passRateEl,
    failCountEl: !!failCountEl,
    uniqueRulesEl: !!uniqueRulesEl,
  });

  if (runsEl) {
    runsEl.textContent = String(summary?.runsInWindow ?? "—");
  }

  if (passRateEl) {
    const pct =
      summary?.passRate != null ? Math.round(summary.passRate * 100) + "%" : "—";
    passRateEl.textContent = `Pass rate: ${pct}`;
  }

  if (failCountEl) {
    failCountEl.textContent = String(summary?.failuresInWindow ?? "0");
  }

  if (uniqueRulesEl) {
    uniqueRulesEl.textContent = `${summary?.uniqueRules ?? 0} unique rules`;
  }
}

export function setFilterOptions(key, value) {
  FILTERS[key] = value;
  // Simple behavior for now: reload the dashboard when a filter changes.
  loadDashboard();
}

export function getFilterOptions() {
  return { ...FILTERS };
}

// ----- Internal helpers: config + headers -------------------------------
function _getCfg() {
  const cfg =
    window.ILLARA_CFG ||
    window.ENV ||
    window.ILLARA_ENV ||
    null;

  console.log("[UI] _getCfg(): raw cfg", {
    hasCfg: !!cfg,
    keys: cfg ? Object.keys(cfg) : [],
  });

  if (!cfg) {
    // In fake mode we *don’t* hard-fail here, just log.
    console.warn("[UI] Supabase config missing – running in FAKE mode only");
  }

  const url =
    cfg?.SUPABASE_URL ||
    cfg?.supabaseUrl ||
    null;

  const anonKey =
    cfg?.SUPABASE_ANON_KEY ||
    cfg?.supabaseAnonKey ||
    null;

  console.log(
    "[UI] _getCfg(): resolved URL / anonKey present?",
    !!url,
    !!anonKey
  );

  // Return a simple normalized object so the rest of ui.js can always use UPPERCASE
  return {
    ...(cfg || {}),
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anonKey,
  };
}
