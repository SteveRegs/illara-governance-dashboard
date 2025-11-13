
// app.js — ESM
import { loadDashboard, setFilterOptions, getFilterOptions } from "./ui.js?v=20251108o";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/supabase.js";

// 1) Read ENV injected by env.public.js
const CFG = window.ENV || window.ILLARA_ENV;
if (!CFG || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) {
  console.error("ENV check failed:", { hasENV: !!CFG, keys: CFG && Object.keys(CFG) });
  throw new Error("ENV not loaded or missing keys: include env.public.js before app.js");
}

// 2) Create client + expose for quick console-tests
export const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
// after: export const supabase = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
window.sb = supabase; // debug alias so you can poke in the console

// Make it globally reachable as a fallback for ui.js
window.supabase = supabase;
console.log("[APP] supabase set:", typeof window.supabase, "from:", typeof window.supabase?.from);


if (!window.supabase || typeof window.supabase.from !== "function") {
  console.error("[Supabase] createClient failed (no .from). ENV keys present?",
    { hasENV: !!window.ENV, keys: window.ENV ? Object.keys(window.ENV) : [] });
  throw new Error("Supabase client init failed");
}

console.log("[DEBUG] created supabase", {
  present: !!window.supabase,
  hasFrom: !!(window.supabase && window.supabase.from),
  envKeys: window.ENV ? Object.keys(window.ENV) : [],
});

// 3) (optional) Hook helpers (keep if you use them)
window.loadDashboard    = () => loadDashboard(window.supabase);
window.setFilterOptions = setFilterOptions;
window.getFilterOptions = getFilterOptions;

// 4) Kick-off UI (with friendly console on failure)
loadDashboard(window.supabase).catch((e) => {
  console.error("Dashboard load error:", e);
  const callout = document.querySelector("#failSpan");
  if (callout) callout.textContent = e.message || String(e);
});

const VIEWS = {
  RECENT: "governance_recent",           // one row per run
  FAILS:  "governance_failures_flat"     // one row per failure
};

// Try common timestamp field names on views
function pickTs(row) {
  const cand = row.run_ts ?? row.ts ?? row.created_at ?? row.inserted_at ?? row.occurred_at ?? row.time ?? null;
  return cand ? new Date(cand) : new Date();
}

// ----- App state
const state = {
  runs: [],     // raw cache
  fails: [],
  filters: { phase: "__all", principle: "__all", window: "7d" }
};

// Helpers
function windowToSince(win) {
  const now = new Date();
  if (win === "24h") return new Date(now.getTime() - 24*3600*1000);
  if (win === "7d")  return new Date(now.getTime() - 7*24*3600*1000);
  if (win === "30d") return new Date(now.getTime() - 30*24*3600*1000);
  return null;
}

// Defensive normalizers
function normalizeRunRow(r) {
  return {
    run_id: r.run_id ?? r.id ?? "",
    run_ts: pickTs(r),
    phase:  r.phase ?? "unknown",
    status: (r.status || (r.failed_checks > 0 ? "fail":"pass")).toLowerCase(),
    total_checks: Number.isFinite(r.total_checks) ? r.total_checks : (r.passed_checks + r.failed_checks || 0),
    failed_checks: Number.isFinite(r.failed_checks) ? r.failed_checks : (r.failures || 0)
  };
}
function normalizeFailRow(f) {
  return {
    run_id: f.run_id ?? "",
    run_ts: pickTs(f),
    phase: f.phase ?? "unknown",
    principle: f.principle ?? "unspecified",
    rule_id: String(f.rule_id ?? f.rule ?? ""),
    rule_name: f.rule_name ?? "",
    severity: f.severity ?? "info",
    message: f.message ?? ""
  };
}

// Fetch from Supabase (pull superset; filter/sort client-side)
async function fetchAll(windowValue) {
  // Pull up to 1000 rows each; adjust if you need more
  const runsQuery = supabase.from(VIEWS.RECENT).select("*").limit(1000);
  const failsQuery = supabase.from(VIEWS.FAILS).select("*").limit(2000);

  const [runsRes, failsRes] = await Promise.all([runsQuery, failsQuery]);
  if (runsRes.error) throw runsRes.error;
  if (failsRes.error) throw failsRes.error;

  state.runs  = (runsRes.data  || []).map(normalizeRunRow)
                                     .sort((a,b)=>b.run_ts - a.run_ts);
  state.fails = (failsRes.data || []).map(normalizeFailRow)
                                     .sort((a,b)=>b.run_ts - a.run_ts);
}

// Filtered views
function getFiltered() {
  const { phase, principle, window: w } = state.filters;
  const since = windowToSince(w);

  const inWindow = since ? d => d.run_ts >= since : () => true;
  const runs = state.runs.filter(inWindow).filter(r => phase === "__all" ? true : r.phase === phase);
  const fails = state.fails.filter(inWindow)
    .filter(f => phase === "__all" ? true : f.phase === phase)
    .filter(f => principle === "__all" ? true : f.principle === principle);
  return { runs, fails };
}

// Metrics + trend + callout logic
function computeSummary({ runs, fails }) {
  const runsCount = runs.length;
  const failCount = fails.length;
  const passCount = runs.filter(r => r.status === "pass" || r.failed_checks === 0).length;
  const passRate = runsCount ? Math.round((passCount / runsCount) * 100) : 0;

  const uniqueFailRules = new Set(fails.map(f => f.rule_id || `${f.principle}:${f.rule_name}`)).size;

  // Trend: failures per run (oldest → newest)
  const map = new Map();
  fails.forEach(f => map.set(f.run_id, (map.get(f.run_id) || 0) + 1));
  const trendSeries = runs.slice().reverse().map(r => map.get(r.run_id) || 0);
  const trendLabels = runs.slice().reverse().map(r => r.run_ts);

  // New-failures callout vs most recent passing run
  const sorted = runs.slice().sort((a,b)=>b.run_ts - a.run_ts);
  const latestRun = sorted[0];
  let lastPassTs = null;
  for (const r of sorted) {
    if (r.status === "pass" || r.failed_checks === 0) { lastPassTs = r.run_ts; break; }
  }
  let newFailuresDetected = false;
  let newFailCount = 0;
  if (latestRun) {
    const latestFails = fails.filter(f => f.run_id === latestRun.run_id);
    if (!lastPassTs || latestRun.run_ts > lastPassTs) {
      newFailuresDetected = latestFails.length > 0;
      newFailCount = latestFails.length;
    }
  }

  return {
    runsCount, failCount, passRate, uniqueFailRules,
    trendSeries, trendLabels,
    callout: { newFailuresDetected, newFailCount, latestRun }
  };
}

// Populate filters from data
function hydrateFilterOptions() {
  const phases = Array.from(new Set(state.runs.map(r => r.phase))).sort();
  const principles = Array.from(new Set(state.fails.map(f => f.principle))).sort();
  setFilterOptions({ phases, principles });
}

// Render pipeline
function renderAll() {
  const { runs, fails } = getFiltered();
  const summary = computeSummary({ runs, fails });

  renderCallout(summary.callout);
  renderCards({
    runsCount: summary.runsCount,
    failCount: summary.failCount,
    passRate: summary.passRate,
    uniqueRules: summary.uniqueFailRules
  });
  setTrend(summary.trendLabels, summary.trendSeries);
  renderRunsTable(runs);
  renderFailsTable(fails);
}

// UI events
function wireInteractions() {
  const phaseSel = document.getElementById("phaseFilter");
  const principleSel = document.getElementById("principleFilter");
  const windowSel = document.getElementById("windowFilter");
  const refreshBtn = document.getElementById("refreshBtn");

  const onChange = () => {
    state.filters.phase = phaseSel.value;
    state.filters.principle = principleSel.value;
    state.filters.window = windowSel.value;
    renderAll(); // re-render quickly from cached superset
  };
  [phaseSel, principleSel, windowSel].forEach(el => el.addEventListener("change", onChange));

  refreshBtn.addEventListener("click", async () => {
    await fetchAll(state.filters.window);     // pull fresh data
    hydrateFilterOptions();
    renderAll();
  });
}
loadDashboard().catch((e) => {
  console.error("Dashboard load error:", e);
  const callout = document.querySelector("#failSpan");
  if (callout) callout.textContent = e.message || String(e);
});



