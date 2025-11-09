// ui.js — non-module, uses window.supabase set by app.js

export async function loadDashboard() {
  if (!window.supabase) throw new Error("Supabase client not available");

  // Get the latest 25 governance reports
  const { data, error } = await window.supabase
    .from("governance_reports")
    .select("id,phase,generated_at,pass,source")
    .order("generated_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];

  // Pick a tbody that actually exists on the page
  const tbody =
    document.querySelector("#recent-runs-body") ||
    document.querySelector("#failTable tbody");

  if (!tbody) {
    console.warn("No tbody found for recent runs");
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
