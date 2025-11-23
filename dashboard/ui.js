// ---------------------------------------------------------------------------
// UI helpers for Illara Governance Dashboard – Phase 2
// This file only cares about DOM updates. No fetch / Supabase calls here.
// ---------------------------------------------------------------------------

// Tiny log helper so we can see what's happening without breaking anything.
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

// Expose for debugging in the console, if needed.
if (typeof window !== "undefined") {
  window.UI = UI;
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function updateSummaryCards(summary) {
  UI.log("updateSummaryCards()", summary);

  if (!summary) return;

  const runsEl = document.getElementById("runsCount");
  const passPillEl = document.getElementById("passRatePill");
  const failEl = document.getElementById("failCount");
  const uniqueEl = document.getElementById("uniqueRules");

  if (runsEl) {
    runsEl.textContent = String(summary.runsInWindow ?? "—");
  }

  if (passPillEl) {
    let label = "Pass rate: —";
    if (summary.passRate != null) {
      const pct = Math.round(summary.passRate * 100);
      label = `Pass rate: ${pct}%`;
    }
    passPillEl.textContent = label;
  }

  if (failEl) {
    failEl.textContent = String(summary.failuresInWindow ?? 0);
  }

  if (uniqueEl) {
    uniqueEl.textContent = `${summary.uniqueRules ?? 0} unique rules`;
  }
}

// ---------------------------------------------------------------------------
// "Recent Runs" table
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// "Failures (Flat)" table
// ---------------------------------------------------------------------------

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

      // Right-align severity if you like, or leave as-is
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

// Make these functions visible to app.js (global scope in the browser)
if (typeof window !== "undefined") {
  window.updateSummaryCards = updateSummaryCards;
  window.updateRecentRunsTable = updateRecentRunsTable;
  window.updateFailuresTable = updateFailuresTable;
}
