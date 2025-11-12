// ui.js — plain script (ESM), runs after app.js
console.log("[UI] loaded tag 20251108n");

export async function loadDashboard(clientParam = window.supabase) {
  // prefer explicit param; fall back to global (and be gentle if missing)
  const client = clientParam || window.supabase;

  // soft guard — LOG & bail (no throw) if client isn't ready yet
  if (!client || typeof client.from !== "function") {
    console.warn("[UI] Supabase client not ready — skipping this render tick.", {
      hasClientParam: !!clientParam,
      hasGlobal: !!window.supabase,
      envKeys: window.ENV ? Object.keys(window.ENV) : [],
    });
    return; // just skip this cycle
  }

  console.debug("[UI] loadDashboard(): client OK, proceeding.");

  // --- recent runs ----------------------------------------------------------
  const { data, error } = await client
    .from("governance_reports")
    .select("id,phase,generated_at,pass,source")
    .order("generated_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  // pick a <tbody> that exists
  const tbody =
    document.querySelector("#recent-runs-body") ||
    document.querySelector("#failTable tbody");

  if (!tbody) {
    console.warn("No tbody found to render runs");
    return;
  }

  tbody.innerHTML = rows
    .map((r) => `
      <tr>
        <td>${new Date(r.generated_at).toLocaleString()}</td>
        <td>${r.id}</td>
        <td>${r.phase ?? ""}</td>
        <td>${r.pass ? "pass" : "fail"}</td>
        <td>${r.source ?? ""}</td>
      </tr>
    `)
    .join("");

  // try the secondary view but don't fail the page if it's not ready yet
  await tryFailuresFlat();
}

// don't let one missing view kill the page
async function tryFailuresFlat() {
  try {
    const url = `${window.ENV.SUPABASE_URL}/rest/v1/governance_failures_flat?select=*&limit=2000`;
    const r = await fetch(url, {
      headers: {
        apikey: window.ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.ENV.SUPABASE_ANON_KEY}`,
      },
    });
    if (!r.ok) throw new Error(`failures_flat ${r.status}`);
    // const data = await r.json(); // use later
  } catch (e) {
    console.warn("failures_flat not available yet -- skipping");
  }
}

// ---- simple filter state + controller --------------------------------------
const FILTERS = { phase: "all", principle: "all", range: "7d" };

export function setFilterOptions(key, value) {
  FILTERS[key] = value;
  // simple behavior for now: reload dashboard when a filter changes
  loadDashboard();
}

export function getFilterOptions() {
  return { ...FILTERS };
}
