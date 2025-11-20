// ui.js — plain script (ESM), TEMP fake mode + config helper

console.log("[UI] ui.js script loaded");

// ----- Filter state (still simple for now) ------------------------------
const FILTERS = { phase: "all", principle: "all", range: "7d" };
const METRIC_WINDOW_DAYS = 7;

// ----- Public API -------------------------------------------------------
export async function loadDashboard() {
  const cfg = _getCfg();

  console.debug("[UI] loadDashboard(): starting (TEMP fake mode)", {
    hasCfg: !!cfg,
    keys: cfg ? Object.keys(cfg) : [],
  });

  // TEMP: fake data so we can prove the UI/JS is running
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
      time: "2025-11-18 12:31",
      runId: "RUN-002",
      phase: "runtime",
      principle: "Integrity",
      rule: "EDR-001",
      severity: "high",
      message: "Example failure – governance rule tripped.",
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

  // For now we’re just logging. Once this is confirmed working,
  // we can wire these objects into the DOM (cards & tables).

  /*
  // When we're ready to talk to Supabase again, we'll UNCOMMENT this block:
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
