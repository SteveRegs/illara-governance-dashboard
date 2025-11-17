// ui.js — plain script (ESM), runs after app.js

// ---- Filter state (still simple for now) ---------------------------------

const FILTERS = { phase: "all", principle: "all", range: "7d" };

// Default window for metrics (in days)
const METRIC_WINDOW_DAYS = 7;

// ---- Public API ----------------------------------------------------------

export async function loadDashboard(clientParam = window.supabase) {
  // Prefer explicit param; fall back to global
  const client = clientParam || window.supabase;

  // Soft guard — log & bail silently instead of throwing
  if (!client || typeof client.from !== "function") {
    console.warn("[UI] Supabase client not ready — skipping this render tick.", {
      hasClientParam: !!clientParam,
      hasGlobal: !!window.supabase,
      envKeys: window.ENV ? Object.keys(window.ENV) : [],
    });
    return; // do NOT throw; just skip this cycle
  }

  console.debug("[UI] loadDashboard(): client OK, proceeding…");

  // Kick off summary metrics (do not let failure kill the page)
  loadSummaryMetrics(client).catch((e) => {
    console.warn("[UI] summary metrics error:", e);
  });

  // ---- Recent runs table -------------------------------------------------
  const { data, error } = await client
    .from("governance_reports")
    .select("id, phase, generated_at, pass, source")
    .order("generated_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  // Pick a tbody that exists
  const tbody =
    document.querySelector("#recent-runs-body") ||
    document.querySelector("#failTable tbody");

  if (!tbody) {
    console.warn("No tbody found to render runs");
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

  // ---- Failures flat (optional second view) ------------------------------
  await tryFailuresFlat(client);
}

export function setFilterOptions(key, value) {
  FILTERS[key] = value;
  // Simple behavior for now: reload the dashboard when a filter changes.
  loadDashboard();
}

export function getFilterOptions() {
  return { ...FILTERS };
}

// ---- Summary metrics (top cards) ----------------------------------------

async function loadSummaryMetrics(client) {
  const now = new Date();
  const from = new Date(
    now.getTime() - METRIC_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  // Base metrics from governance_reports
  const { data, error } = await client
    .from("governance_reports")
    .select("id, pass, generated_at")
    .gte("generated_at", from.toISOString())
    .lte("generated_at", now.toISOString())
    .order("generated_at", { ascending: false });

  if (error) {
    console.warn("[UI] metrics governance_reports query failed:", error);
    // Leave cards as-is if there’s an error (they probably show "—")
    return;
  }

  const rows = Array.isArray(data) ? data : [];

  const totalRuns = rows.length;
  const passCount = rows.filter((r) => r.pass).length;
  const failCount = totalRuns - passCount;
  const passRate = totalRuns
    ? Math.round((passCount / totalRuns) * 100)
    : 0;

  // Push values into your existing elements
  setTextById("runsCount", totalRuns ? String(totalRuns) : "0");
  setPassRatePill(passRate, totalRuns);
  setTextById("failCount", failCount ? String(failCount) : "0");

  // Optional: unique failing rules metric, best-effort only
  await loadUniqueFailingRulesMetric(from, now);
}

async function loadUniqueFailingRulesMetric(from, now) {
  if (!window.ENV || !window.ENV.SUPABASE_URL) {
    console.warn("[UI] ENV missing for unique rules metric, skipping.");
    return;
  }

  try {
    const baseUrl = `${window.ENV.SUPABASE_URL}/rest/v1/governance_failures_flat`;
    const url = new URL(baseUrl);

    // We expect governance_failures_flat to have rule_code + created_at (or similar)
    url.searchParams.set("select", "rule_code,created_at");
    url.searchParams.set("created_at.gte", from.toISOString());
    url.searchParams.set("created_at.lte", now.toISOString());
    url.searchParams.set("limit", "2000");

    const r = await fetch(url.toString(), {
      headers: {
        apikey: window.ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.ENV.SUPABASE_ANON_KEY}`,
      },
    });

    if (!r.ok) throw new Error(`failures_flat ${r.status}`);
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
    // Leave the card as "unique rules" instead of crashing anything
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

// ---- Failures flat (table render placeholder) ----------------------------

async function tryFailuresFlat(client) {
  try {
    const url = `${window.ENV.SUPABASE_URL}/rest/v1/governance_failures_flat?select=*&limit=2000`;
    const r = await fetch(url, {
      headers: {
        apikey: window.ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.ENV.SUPABASE_ANON_KEY}`,
      },
    });

    if (!r.ok) throw new Error(`failures_flat ${r.status}`);
    const data = await r.json();

    // TODO: render failures_flat into the Failures table
    console.debug("[UI] failures_flat sample:", data?.slice?.(0, 3) ?? data);
  } catch (e) {
    console.warn("failures_flat not available yet — skipping", e);
  }
}
