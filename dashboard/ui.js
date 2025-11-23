// ui.js — Phase 2 minimal fake-data UI (v20251120-1)

// --- Filter state -----------------------------------------------------------
const FILTERS = { phase: "all", principle: "all", range: "7d" };
const METRIC_WINDOW_DAYS = 7;

// true  = use hard-coded fake data
// false = use real Supabase data (later)
const USE_FAKE_DATA = false;

// ----- Public API -----------------------------------------------------------
export async function loadDashboard() {
  // Helper: run current FAKE mode so we keep today's success intact
  function runFakeMode() {
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

    updateSummaryCards(fakeSummary);
    updateRecentRunsTable(fakeRuns);
    updateFailuresTable(fakeFailures);
  }

  // 1) If we're explicitly in FAKE mode, just run it and stop.
  if (USE_FAKE_DATA) {
    console.log("[UI] loadDashboard(): starting", {
      mode: "FAKE",
    });
    runFakeMode();
    return;
  }

  // 2) REAL MODE: talk to Supabase
  const cfg = getCfg();

  console.log("[UI] loadDashboard(): starting", {
    mode: "REAL",
    hasCfg: !!cfg,
    keys: cfg ? Object.keys(cfg) : [],
  });

  try {
    const [summary, runs, failures] = await Promise.all([
      fetchSummaryFromSupabase(cfg),
      fetchRecentRunsFromSupabase(cfg),
      fetchFailuresFromSupabase(cfg),
    ]);

    console.log("[UI] REAL summary metrics", summary);
    console.log("[UI] REAL recent runs", runs);
    console.log("[UI] REAL flat failures", failures);

    updateSummaryCards(summary);
    updateRecentRunsTable(runs);
    updateFailuresTable(failures);
  } catch (e) {
    console.error("[UI] loadDashboard(): REAL mode failed, falling back to FAKE", e);
    runFakeMode();
  }

}

// ----- Supabase fetch helpers ---------------------------------------------

async function fetchSummaryFromSupabase(cfg) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg;
  const url = `${SUPABASE_URL}/rest/v1/runs_window_summary?select=*`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchSummaryFromSupabase() failed: ${res.status} ${res.statusText}`);
  }

  const rows = await res.json();
  return rows?.[0] ?? {
    runsInWindow: 0,
    passRate: null,
    failuresInWindow: 0,
    uniqueRules: 0,
  };
}

async function fetchRecentRunsFromSupabase(cfg) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg;
  const url = `${SUPABASE_URL}/rest/v1/runs_recent?select=*&order=time.desc&limit=20`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchRecentRunsFromSupabase() failed: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

async function fetchFailuresFlatFromSupabase(cfg) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg;
  const url = `${SUPABASE_URL}/rest/v1/failures_flat?select=*&order=time.desc&limit=50`;

  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchFailuresFlatFromSupabase() failed: ${res.status} ${res.statusText}`);
  }

  return await res.json();
}

  // ---- REAL MODE: currently still uses fake data via helpers ----
const cfg = getCfg();

console.log("[UI] loadDashboard(): REAL mode starting", {
  hasCfg: !!cfg,
  keys: cfg ? Object.keys(cfg) : [],
});

try {
  const [summary, runs, failures] = await Promise.all([
    loadSummaryMetricsFromSupabase(cfg),
    loadRecentRunsFromSupabase(cfg),
    loadFailuresFlatFromSupabase(cfg),
  ]);

  console.log("[UI] REAL summary metrics", summary);
  console.log("[UI] REAL recent runs", runs);
  console.log("[UI] REAL flat failures", failures);

  updateSummaryCards(summary);
  updateRecentRunsTable(runs);
  updateFailuresTable(failures);
} catch (err) {
  console.error("[UI] loadDashboard(): REAL mode failed", err);
}
  // 2) REAL mode – require a usable Supabase config
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    console.warn(
      "[UI] loadDashboard(): Supabase config missing / incomplete; falling back to FAKE mode"
    );
    runFakeMode();
    return;
  }

  // 3) REAL mode path: hit Supabase REST, then paint the UI.
  try {
    const [summary, runs, failures] = await Promise.all([
      loadSummaryMetricsFromSupabase(cfg),
      loadRecentRunsFromSupabase(cfg),
      loadFailuresFlatFromSupabase(cfg),
    ]);

    console.log("[UI] REAL summary metrics", summary);
    console.log("[UI] REAL recent runs", runs);
    console.log("[UI] REAL flat failures", failures);

    updateSummaryCards(summary);
    updateRecentRunsTable(runs);
    updateFailuresTable(failures);
  } catch (err) {
    console.error(
      "[UI] loadDashboard(): REAL mode failed; falling back to FAKE mode",
      err
    );
    runFakeMode();
  }

// TEMP real-mode helpers — for now they just return the same fake data.
// Later, we'll replace their bodies with real Supabase REST calls.

async function loadSummaryMetricsFromSupabase(cfg) {
  console.log("[UI] loadSummaryMetricsFromSupabase(): TEMP fake path", { cfg });

  return {
    runsInWindow: 12,
    passRate: 0.83,
    failuresInWindow: 3,
    uniqueRules: 2,
  };
}

async function loadRecentRunsFromSupabase(cfg) {
  console.log("[UI] loadRecentRunsFromSupabase(): TEMP fake path", { cfg });

  return [
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
}

async function loadFailuresFlatFromSupabase(cfg) {
  console.log("[UI] loadFailuresFlatFromSupabase(): TEMP fake path", { cfg });

  return [
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
}

// ----- Supabase real-mode helpers ------------------------------------------

function makeSupabaseHeaders(cfg) {
  const anon = cfg.SUPABASE_ANON_KEY;
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function fetchJson(url, headers, label) {
  console.log(`[UI] fetchJson(): requesting ${label}`, { url });

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[UI] fetchJson(): ${label} failed`, {
      status: res.status,
      text,
    });
    throw new Error(`${label} request failed with ${res.status}`);
  }

  const data = await res.json();
  console.log(`[UI] fetchJson(): ${label} success`, data);
  return data;
}

// 2a) Summary for the top cards (runs_window_summary view)
async function fetchSummaryFromSupabase(cfg) {
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("[UI] fetchSummaryFromSupabase: missing Supabase config");
  }

  const base = cfg.SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/rest/v1/runs_window_summary?select=*`;

  const rows = await fetchJson(url, makeSupabaseHeaders(cfg), "runs_window_summary");

  const row = rows[0] || {};

  // Normalize to the shape updateSummaryCards expects
  return {
    runsInWindow: row.runs_in_window ?? row.runsInWindow ?? 0,
    passRate: row.pass_rate ?? row.passRate ?? 0,
    failuresInWindow: row.failures_in_window ?? row.failuresInWindow ?? 0,
    uniqueRules: row.unique_rules ?? row.uniqueRules ?? 0,
  };
}

// 2b) Recent runs table (runs_recent view)
async function fetchRecentRunsFromSupabase(cfg) {
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("[UI] fetchRecentRunsFromSupabase: missing Supabase config");
  }

  const base = cfg.SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/rest/v1/runs_recent?select=*&order=time.desc&limit=20`;

  const rows = await fetchJson(url, makeSupabaseHeaders(cfg), "runs_recent");

  // Map to the fake-data shape so the renderer can reuse it
  return rows.map((r) => ({
    time: r.time,
    runId: r.run_id ?? r.runId,
    phase: r.phase,
    checks: r.checks,
    failures: r.failures,
    status: r.status,
  }));
}

// 2c) Flat failures table (failures_flat view)
async function fetchFailuresFromSupabase(cfg) {
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("[UI] fetchFailuresFromSupabase: missing Supabase config");
  }

  const base = cfg.SUPABASE_URL.replace(/\/+$/, "");
  const url = `${base}/rest/v1/failures_flat?select=*&order=time.desc&limit=50`;

  const rows = await fetchJson(url, makeSupabaseHeaders(cfg), "failures_flat");

  return rows.map((f) => ({
    time: f.time,
    runId: f.run_id ?? f.runId,
    phase: f.phase,
    principle: f.principle,
    rule: f.rule,
    severity: f.severity,
    message: f.message,
  }));
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

// ------- Supabase fetch helpers (REAL MODE) ------------------------------

async function fetchSummaryFromSupabase(cfg) {
  console.log("[UI] fetchSummaryFromSupabase(): starting", { url: cfg.SUPABASE_URL });

  const url = `${cfg.SUPABASE_URL}/rest/v1/runs_window_summary?select=*`;

  const res = await fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchSummaryFromSupabase(): HTTP ${res.status}`);
  }

  const rows = await res.json();
  const row = rows[0] || {};

  // Try a few likely column names, then normalize to the camelCase shape
  const summary = {
    runsInWindow:
      row.runs_in_window ??
      row.runsInWindow ??
      row.runs ?? 0,
    passRate:
      row.pass_rate ??
      row.passRate ??
      row.pass_rate_pct ??
      0,
    failuresInWindow:
      row.failures_in_window ??
      row.failuresInWindow ??
      row.failures ?? 0,
    uniqueRules:
      row.unique_rules ??
      row.uniqueRules ??
      row.rules ?? 0,
  };

  console.log("[UI] fetchSummaryFromSupabase(): normalized", summary);
  return summary;
}

async function fetchRecentRunsFromSupabase(cfg) {
  console.log("[UI] fetchRecentRunsFromSupabase(): starting");

  const url =
    `${cfg.SUPABASE_URL}/rest/v1/runs_recent` +
    `?select=*` +
    `&order=run_time.desc` +
    `&limit=20`;

  const res = await fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchRecentRunsFromSupabase(): HTTP ${res.status}`);
  }

  const rows = await res.json();

  // Normalize each row into the shape the UI expects
  const runs = rows.map((row) => ({
    time: row.time ?? row.run_time ?? row.created_at ?? "",
    runId: row.run_id ?? row.runId ?? "",
    phase: row.phase ?? "",
    checks: row.checks ?? row.total_checks ?? 0,
    failures: row.failures ?? row.failure_count ?? 0,
    status: row.status ?? row.overall_status ?? "",
  }));

  console.log("[UI] fetchRecentRunsFromSupabase(): normalized", runs);
  return runs;
}

async function fetchFailuresFlatFromSupabase(cfg) {
  console.log("[UI] fetchFailuresFlatFromSupabase(): starting");

  const url =
    `${cfg.SUPABASE_URL}/rest/v1/failures_flat` +
    `?select=*` +
    `&order=time.desc` +
    `&limit=50`;

  const res = await fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`[UI] fetchFailuresFlatFromSupabase(): HTTP ${res.status}`);
  }

  const rows = await res.json();

  const failures = rows.map((row) => ({
    time: row.time ?? row.run_time ?? row.created_at ?? "",
    runId: row.run_id ?? row.runId ?? "",
    phase: row.phase ?? "",
    principle: row.principle ?? "",
    rule: row.rule ?? row.rule_code ?? "",
    severity: row.severity ?? row.level ?? "",
    message: row.message ?? row.failure_message ?? "",
  }));

  console.log("[UI] fetchFailuresFlatFromSupabase(): normalized", failures);
  return failures;
}

// ----- Supabase REST helpers for REAL mode --------------------------------/

// ----- Supabase-REST helpers for REAL mode --------------------------------

// View / table names in Supabase.
// If your actual table names differ, just change these strings.
const SUPABASE_VIEWS = {
  summary: "governance_reports",      // we'll use this as our summary source for now
  runs: "governance_recent",
  failuresFlat: "governance_failures_flat",
};

/**
 * Generic Supabase REST fetch helper.
 * - path: e.g. `/rest/v1/governance_recent`
 * - search: e.g. `select=*&order=time.desc&limit=50`
 */
async function fetchFromSupabase(cfg, path, search) {
  const base = cfg.SUPABASE_URL;
  const anon = cfg.SUPABASE_ANON_KEY;

  if (!base || !anon) {
    console.warn("[UI] Supabase config missing in fetchFromSupabase()", {
      basePresent: !!base,
      anonPresent: !!anon,
    });
    return [];
  }

  const url = new URL(path, base);
  if (search) {
    url.search = search;
  }

  const res = await fetch(url.toString(), {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[UI] Supabase ${path} failed`,
      res.status,
      res.statusText,
      text
    );
    throw new Error(`Supabase ${path} failed: ${res.status}`);
  }

  return await res.json();
}

// Load top summary metrics from Supabase
async function fetchSummaryFromSupabase(cfg) {
  const view = SUPABASE_VIEWS.summary;

  const rows = await fetchFromSupabase(
    cfg,
    `/rest/v1/${view}`,
    "select=*&limit=1"
  );

  if (!rows || !rows.length) {
    return {
      runsInWindow: 0,
      passRate: null,
      failuresInWindow: 0,
      uniqueRules: 0,
    };
  }

  const r = rows[0];

  // Adjust property names here if your columns differ
  return {
    runsInWindow: r.runs_in_window ?? 0,
    passRate: r.pass_rate ?? null,
    failuresInWindow: r.failures_in_window ?? 0,
    uniqueRules: r.unique_rules ?? 0,
  };
}

// Load "Recent Runs" rows from Supabase
async function fetchRecentRunsFromSupabase(cfg) {
  const view = SUPABASE_VIEWS.runs;

  const rows = await fetchFromSupabase(
    cfg,
    `/rest/v1/${view}`,
    "select=*&order=time.desc&limit=50"
  );

  // Map to the shape the UI expects
  return rows.map((r) => ({
    time: r.time,
    runId: r.run_id,
    phase: r.phase,
    checks: r.checks,
    failures: r.failures,
    status: r.status,
  }));
}

// Load "Failures (Flat)" rows from Supabase
async function fetchFailuresFromSupabase(cfg) {
  const view = SUPABASE_VIEWS.failuresFlat;

  const rows = await fetchFromSupabase(
    cfg,
    `/rest/v1/${view}`,
    "select=*&order=time.desc&limit=100"
  );

  return rows.map((r) => ({
    time: r.time,
    runId: r.run_id,
    phase: r.phase,
    principle: r.principle,
    rule: r.rule,
    severity: r.severity,
    message: r.message,
  }));
}

// ---- DOM helpers ----------------------------------------------------

function updateSummaryCards(summary) {
  const runsEl = document.getElementById("runsCount");
  const passRateEl = document.getElementById("passRatePill");
  const failCountEl = document.getElementById("failCount");
  const uniqueRulesEl = document.getElementById("uniqueRules");

  if (runsEl) {
    runsEl.textContent = String(summary.runsInWindow ?? "–");
  }

  if (passRateEl) {
    const pct =
      summary.passRate != null ? Math.round(summary.passRate * 100) + "%" : "–";
    passRateEl.textContent = `Pass rate: ${pct}`;
  }

  if (failCountEl) {
    failCountEl.textContent = String(summary.failuresInWindow ?? "0");
  }

  if (uniqueRulesEl) {
    uniqueRulesEl.textContent = `${summary.uniqueRules ?? 0} unique rules`;
  }
}

/**
 * Update the "Recent Runs" table with fake (or real) data
 */
function updateRecentRunsTable(runs) {
  console.log("[UI] updateRecentRunsTable(): received runs", runs);

  const table = document.getElementById("runsTable");
  const span = document.getElementById("runsSpan");

  if (!table) {
    console.warn("[UI] updateRecentRunsTable: runsTable not found");
    return;
  }

  // Prefer the explicit tbody id, but fall back to the first <tbody>
  let tbody = table.querySelector("#runsBody") || table.querySelector("tbody");
  if (!tbody) {
    console.warn("[UI] updateRecentRunsTable: tbody not found");
    return;
  }

  // Clear previous rows
  tbody.innerHTML = "";

  if (!Array.isArray(runs) || runs.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 6;
    td.textContent = "No runs in window.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    runs.forEach((run) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${run.time}</td>
        <td>${run.runId}</td>
        <td>${run.phase}</td>
        <td class="right">${run.checks}</td>
        <td class="right">${run.failures}</td>
        <td>${run.status}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  if (span) {
    span.textContent = `${runs.length} recent run${
      runs.length === 1 ? "" : "s"
    }`;
  }
}

/**
 * Update the "Failures (Flat)" table with fake (or real) data
 */
function updateFailuresTable(failures) {
  console.log("[UI] updateFailuresTable(): received failures", failures);

  const table = document.getElementById("failTable");
  const span = document.getElementById("failSpan");

  if (!table) {
    console.warn("[UI] updateFailuresTable: failTable not found");
    return;
  }

  let tbody = table.querySelector("#failBody") || table.querySelector("tbody");
  if (!tbody) {
    console.warn("[UI] updateFailuresTable: tbody not found");
    return;
  }

  // Clear previous rows
  tbody.innerHTML = "";

  if (!Array.isArray(failures) || failures.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.textContent = "No failures in window.";
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    failures.forEach((failure) => {
      const tr = document.createElement("tr");

      const cells = [
        failure.time,
        failure.runId,
        failure.phase,
        failure.principle,
        failure.rule,
        failure.severity,
        failure.message,
      ];

      cells.forEach((value, idx) => {
        const td = document.createElement("td");
        td.textContent = value;
        // Right-align severity column (index 5) if you like
        if (idx === 5) td.classList.add("right");
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  if (span) {
    span.textContent = `${failures.length} flat failure${
      failures.length === 1 ? "" : "s"
    }`;
  }
}


