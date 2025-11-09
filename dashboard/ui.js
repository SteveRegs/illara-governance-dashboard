// ui.js — plain script (no imports), runs after app.js

export async function loadDashboard() {
  if (!window.supabase) throw new Error("Supabase client not available");

  // recent runs
  const { data, error } = await window.supabase
    .from("governance_reports")
    .select("id,phase,generated_at,pass,source")
    .order("generated_at", { ascending: false })
    .limit(25);

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];

  // pick a tbody that exists
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
}

// don’t let one missing view kill the page
async function tryFailuresFlat() {
  try {
    const url = `${window.ENV.SUPABASE_URL}/rest/v1/governance_failures_flat?select=*&limit=2000`;
    const r = await fetch(url, {
      headers: {
        apikey: window.ENV.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${window.ENV.SUPABASE_ANON_KEY}`
      }
    });
    if (!r.ok) throw new Error(`failures_flat ${r.status}`);
    // const data = await r.json(); // use later
  } catch (e) {
    console.warn("failures_flat not available yet — skipping");
  }
}

Promise.all([loadDashboard(), tryFailuresFlat()]).catch((e) => {
  console.error("Dashboard load error:", e);
  const callout = document.querySelector("#failSpan");
  if (callout) callout.textContent = e.message || String(e);
});
