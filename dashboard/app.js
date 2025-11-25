// app.js — single-file controller for Illara Governance Dashboard – Phase 2
// For now this file handles BOTH:
//   • fake demo data
//   • DOM updates for the cards and tables
// Supabase wiring will be added here once the UI is stable again.

// ---------------------------------------------------------------------
// 0) Config
// ---------------------------------------------------------------------

// While we’re debugging, keep the dashboard in FAKE mode.
// Later we’ll flip this to false and plug in real Supabase fetches.
const USE_FAKE_DATA = false;

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
// 1) Tiny logging helper
// ---------------------------------------------------------------------

const UI = {
  log(tag, ...args) {
    console.log(`[UI] ${tag}`, ...args);
  },
  warn(tag, ...args) {
    console.warn(`[UI] ${tag}`, ...args);
  },
  error(tag, ...args) {
    console.error(`[UI] ${tag}`, ...args);
  },
};

// ---------------------------------------------------------------------
// 2) DOM helpers (summary cards + tables)
// ---------------------------------------------------------------------

function updateSummaryCards(summary) {
  UI.log("updateSummaryCards()", summary);

  const runsEl = document.getElementById("runsCount");
  const passEl = document.getElementById("passRatePill");
  const failEl = document.getElementById("failCount");
  const uniqueEl = document.getElementById("uniqueRules");

  if (!runsEl && !passEl && !failEl && !uniqueEl) {
    UI.warn("updateSummaryCards()", "summary card elements not found");
    return;
  }

  if (!summary) {
    if (runsEl) runsEl.textContent = "–";
    if (passEl) passEl.textContent = "Pass rate: –";
    if (failEl) failEl.textContent = "–";
    if (uniqueEl) uniqueEl.textContent = "– unique rules";
    return;
  }

  if (runsEl) runsEl.textContent = String(summary.runsInWindow ?? "–");

  if (passEl) {
    const pct =
      typeof summary.passRate === "number"
        ? Math.round(summary.passRate * 100)
        : null;
    passEl.textContent = pct === null ? "Pass rate: –" : `Pass rate: ${pct}%`;
  }

  if (failEl) failEl.textContent = String(summary.failuresInWindow ?? 0);
  if (uniqueEl) {
    uniqueEl.textContent = `${summary.uniqueRules ?? 0} unique rules`;
  }
}

function updateRecentRunsTable(runs) {
  UI.log("updateRecentRunsTable()", runs);

  const table = document.getElementById("runsTable");
  const body = document.getElementById("runsBody");
  const span = document.getElementById("runsSpan");

  if (!table || !body) {
    UI.warn("updateRecentRunsTable()", "runsTable or runsBody not found");
    return;
  }

  // Clear any existing rows
  body.textContent = "";

  (runs || []).forEach((run) => {
    const tr = document.createElement("tr");

    const cells = [
      run.time ?? "—",
      run.runId ?? "—",
      run.phase ?? "—",
      run.checks ?? "—",
      run.failures ?? "—",
      run.status ?? "—",
    ];

    cells.forEach((value, idx) => {
      const td = document.createElement("td");
      td.textContent = value;

      // Right-align numeric columns (checks + failures)
      if (idx === 3 || idx === 4) {
        td.classList.add("right");
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });

  if (span) {
    span.textContent = `${runs?.length || 0} recent runs`;
  }
}

function updateFailuresTable(failures) {
  UI.log("updateFailuresTable()", failures);

  const table = document.getElementById("failTable");
  const body = document.getElementById("failBody");
  const span = document.getElementById("failSpan");

  if (!table || !body) {
    UI.warn("updateFailuresTable()", "failTable or failBody not found");
    return;
  }

  // Clear any existing rows
  body.textContent = "";

  (failures || []).forEach((f) => {
    const tr = document.createElement("tr");

    const cells = [
      f.time ?? "—",
      f.runId ?? "—",
      f.phase ?? "—",
      f.principle ?? "—",
      f.rule ?? "—",
      f.severity ?? "—",
      f.message ?? "—",
    ];

    cells.forEach((value, idx) => {
      const td = document.createElement("td");
      td.textContent = value;

      // Right-align severity if you like
      if (idx === 5) {
        td.classList.add("right");
      }

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });

  if (span) {
    span.textContent = `${failures?.length || 0} flat failures`;
  }
}

// ---------------------------------------------------------------------
// 3) Fake demo data
// ---------------------------------------------------------------------

function runFakeMode() {
  UI.log("runFakeMode()");

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

  updateSummaryCards(fakeSummary);
  updateRecentRunsTable(fakeRuns);
  updateFailuresTable(fakeFailures);
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
  runFakeMode();
}

//
// ---------------------------------------------------------
// Step A: Supabase REST fetch helpers (REAL mode)
// ---------------------------------------------------------
//

async function fetchSummaryFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/governance_reports?select=*`;
  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn("[APP] fetchSummaryFromSupabase(): response not OK", res.status);
      return [];
    }

    const rows = await res.json();
    UI.log("[APP] fetchSummaryFromSupabase(): rows", rows);
    return rows;
  } catch (err) {
    UI.error("[APP] fetchSummaryFromSupabase(): error", err);
    return [];
  }
}

async function fetchRecentRunsFromSupabase(cfg) {
  // NOTE: no order clause yet – keep it simple until we confirm columns
  const url = `${cfg.SUPABASE_URL}/rest/v1/governance_recent?select=*&limit=50`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[APP] fetchRecentRunsFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    UI.log("[APP] fetchRecentRunsFromSupabase(): rows", rows);
    return rows;
  } catch (err) {
    UI.error("[APP] fetchRecentRunsFromSupabase(): error", err);
    return [];
  }
}

async function fetchFailuresFromSupabase(cfg) {
  // NOTE: no order clause yet – keep it simple until we confirm columns
  const url = `${cfg.SUPABASE_URL}/rest/v1/governance_failures_flat?select=*&limit=100`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[APP] fetchFailuresFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    UI.log("[APP] fetchFailuresFromSupabase(): rows", rows);
    return rows;
  } catch (err) {
    UI.error("[APP] fetchFailuresFromSupabase(): error", err);
    return [];
  }
}

// ---------------------------------------------------------
// Main entry point
// ---------------------------------------------------------
async function loadDashboard() {
  const cfg = getCfg();

  const hasCfg = !!cfg;
  const hasKey = !!(cfg && cfg.SUPABASE_ANON_KEY);
  const url = cfg && cfg.SUPABASE_URL ? cfg.SUPABASE_URL : null;

  UI.log("[APP] loadDashboard(): starting", {
    mode: USE_FAKE_DATA ? "FAKE" : "REAL",
    hasCfg,
    hasKey,
    url,
  });

  if (USE_FAKE_DATA) {
    UI.log("[APP] loadDashboard(): USE_FAKE_DATA = true → running fake mode");
    runFakeMode();
    return;
  }

  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    UI.warn(
      "[APP] Supabase config missing or incomplete; falling back to FAKE mode",
      {
        hasCfg,
        url,
        hasKey,
      }
    );
    runFakeMode();
    return;
  }

  try {
    const [summaryRows, runsRows, failuresRows] = await Promise.all([
      fetchSummaryFromSupabase(cfg),
      fetchRecentRunsFromSupabase(cfg),
      fetchFailuresFromSupabase(cfg),
    ]);

    UI.log("[APP] REAL summary rows", summaryRows);
    UI.log("[APP] REAL recent runs rows", runsRows);
    UI.log("[APP] REAL failures rows", failuresRows);

    // For now we *still* show fake data until we’re sure the shapes are right
    runFakeMode();
  } catch (err) {
    UI.error("[APP] REAL mode failed; falling back to FAKE mode", err);
    runFakeMode();
  }
}

// Kick off immediately
loadDashboard().catch((e) => {
  UI.error("[APP] Dashboard load error:", e);
});

