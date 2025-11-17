// ui.js — plain script, using Supabase REST directly

console.log("[UI] ui.js script loaded");

// ---- Filter state (still simple for now) ---------------------------------

const FILTERS = { phase: "all", principle: "all", range: "7d" };

// Default window for metrics (in days) — we'll tighten this later with filters.
const METRIC_WINDOW_DAYS = 7;

// ---- Public API ----------------------------------------------------------

async function loadDashboard() {
  const cfg = getCfg();

  console.debug("[UI] loadDashboard(): using Supabase REST", {
    url: cfg.SUPABASE_URL,
  });

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
}

function setFilterOptions(key, value) {
  FILTERS[key] = value;
  // Simple behavior for now: reload the dashboard when a filter changes.
  loadDashboard();
}

function getFilterOptions() {
  return { ...FILTERS };
}

// ---- Internal helpers: config + headers ----------------------------------

function getCfg() {
  const cfg = window.ILLARA_CFG || window.ENV || window.ILLARA_ENV;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) {
    throw new Error("[UI] Supabase config missing");
  }
  return cfg;
}

function sbHeaders(cfg) {
  return {
    apikey: cfg.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
  };
}

// ---- Recent runs table ---------------------------------------------------

async function loadRecentRunsTable(cfg) {
  const base = `${cfg.SUPABASE_URL}/rest/v1/governance_reports`;
  const url = new URL(base);

  url.searchParams.set("select", "id,phase,generated_at,pass,source");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("limit", "25");

  const r = await fetch(url.toString(), {
    headers: sbHeaders(cfg),
  });

  if (!r.ok) {
    throw new Error(`governance_reports (recent runs) ${r.status}`);
  }

  const data = await r.json();
  const rows = Array.isArray(data) ? data : [];

  const tbody =
    document.querySelector("#recent-runs-body") ||
    document.querySelector("#failTable tbody");

  if (!tbody) {
    console.warn("[UI] No tbody found to render runs");
    return;
  }

  tbody.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${new Date(r.generated_at).toLocaleString()}</td>
        <td>${r.id}</td>
        <td>${r.phase ?? ""}</td>
        <td>${r.pass ? "pass" : "fail"}</td>
        <td>${r.source ?? ""}</td>
      </tr>`
    )
    .join("");
}

// ---- Summary metrics (top cards) ----------------------------------------

async function loadSummaryMetrics(cfg) {
  const now = new Date();
  const from = new Date(
    now.getTime() - METRIC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  const base = `${cfg.SUPABASE_URL}/rest/v1/governance_reports`;
  const url = new URL(base);

  url.searchParams.set("select", "id,pass,generated_at");
  url.searchParams.set("order", "generated_at.desc");
  url.searchParams.set("generated_at.gte", from.toISOString());
  url.searchParams.set("generated_at.lte", now.toISOString());

  const r = await fetch(url.toString(), {
    headers: sbHeaders(cfg),
  });

  if (!r.ok) {
    console.warn(
      "[UI] metrics governance_reports query failed:",
      r.status,
      r.statusText
    );
    return;
  }

  const data = await r.json();
  const rows = Array.isArray(data) ? data : [];

  const totalRuns = rows.length;
  const passCount = rows.filter((row) => row.pass).length;
  const failCount = totalRuns - passCount;
  const passRate = totalRuns
    ? Math.round((passCount / totalRuns) * 100)
    : 0;

  setTextById("runsCount", totalRuns ? String(totalRuns) : "0");
  setPassRatePill(passRate, totalRuns);
  setTextById("failCount", failCount ? String(failCount) : "0");

  await loadUniqueFailingRulesMetric(cfg, from, now);
}

async function loadUniqueFailingRulesMetric(cfg, from, now) {
  const base = `${cfg.SUPABASE_URL}/rest/v1/governance_failures_flat`;
  const url = new URL(base);

  url.searchParams.set("select", "rule_code,created_at");
  url.searchParams.set("created_at.gte", from.toISOString());
  url.searchParams.set("created_at.lte", now.toISOString());
  url.searchParams.set("limit", "2000");

  try {
    const r = await fetch(url.toString(), {
      headers: sbHeaders(cfg),
    });

    if (!r.ok) throw new Error(`failures_flat (unique rules) ${r.status}`);

    const data = await r.json();
    const codes = new Set();

    for (const row of data || []) {
      if (row.rule_code) codes.add(row.rule_code);
    }

    const count = codes.size || 0;
    setUniqueRulesMetric(count);
  } catch (e) {
    console.warn(
      "[UI] unique failing rules metric skipped (likely view/column not ready):",
      e
    );
  }
}

// ---- Failures flat (table render placeholder) ----------------------------

async function tryFailuresFlat(cfg) {
  const base = `${cfg.SUPABASE_URL}/rest/v1/governance_failures_flat`;
  const url = new URL(base);

  url.searchParams.set("select", "*");
  url.searchParams.set("limit", "2000");

  try {
    const r = await fetch(url.toString(), {
      headers: sbHeaders(cfg),
    });

    if (!r.ok) throw new Error(`failures_flat ${r.status}`);

    const data = await r.json();

    console.debug("[UI] failures_flat sample:", data?.slice?.(0, 3) ?? data);
  } catch (e) {
    console.warn("failures_flat not available yet — skipping", e);
  }
}

// ---- Small DOM helpers ---------------------------------------------------

function setTextById(id, value) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn("[UI] metric element not found:", id);
    return;
  }
  el.textContent = value;
}

function setPassRatePill(rate, totalRuns) {
  const el = document.getElementById("passRatePill");
  if (!el) return;

  if (!totalRuns) {
    el.textContent = "Pass rate: —";
  } else {
    el.textContent = `Pass rate: ${rate}%`;
  }
}

function setUniqueRulesMetric(count) {
  const el = document.getElementById("uniqueRules");
  if (!el) return;

  if (!count) {
    el.textContent = "unique rules";
  } else {
    el.textContent = `${count} unique rules`;
  }
}

// ---- Attach public API to window -----------------------------------------

window.loadDashboard = loadDashboard;
window.setFilterOptions = setFilterOptions;
window.getFilterOptions = getFilterOptions;
