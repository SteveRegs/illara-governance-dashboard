// ---------------------------------------------------------------------------
// UI helpers for Illara Governance Dashboard – Phase 2
// This file only cares about DOM updates. No fetch / Supabase calls here.
// ---------------------------------------------------------------------------

// Tiny log helper so we can see what's happening without breaking anything.
// Global UI helper – single source of truth
window.UI = {
  log(tag, ...args) {
    console.log("[UI]", tag, ...args);
  },
  warn(tag, ...args) {
    console.warn("[UI]", tag, ...args);
  },
  error(tag, ...args) {
    console.error("[UI]", tag, ...args);
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
    // --- Update status pill text once REAL data is shown ---
  try {
    const titleEl = document.querySelector("[data-summary-status-title]");
    const subtitleEl = document.querySelector("[data-summary-status-subtitle]");

    if (titleEl) {
      titleEl.textContent = "Last updated";
    }

    if (subtitleEl) {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      subtitleEl.textContent = `at ${timeString}`;
    }
  } catch (err) {
    if (window.UI && UI.warn) {
      UI.warn("[UI] Failed to update status pill", err);
    }
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

function updateSummaryStatus(lastUpdated) {
  const titleEl = document.querySelector("[data-summary-status-title]");
  const subtitleEl = document.querySelector("[data-summary-status-subtitle]");

  if (!titleEl || !subtitleEl) {
    UI.warn("updateSummaryStatus()", "status elements not found");
    return;
  }

  if (!lastUpdated) {
    titleEl.textContent = "Last updated";
    subtitleEl.textContent = "—";
    return;
  }

  // Accept either a Date or a timestamp string
  const dt = lastUpdated instanceof Date ? lastUpdated : new Date(lastUpdated);

  titleEl.textContent = "Last updated";
  subtitleEl.textContent = dt.toLocaleString();
}

function updateDemoServiceMeta(checkRows) {
  // Log what we received so we can debug easily
  UI.log("[UI] updateDemoServiceMeta(): entry", {
    type: Array.isArray(checkRows) ? "array" : typeof checkRows,
    count: Array.isArray(checkRows) ? checkRows.length : 0,
  });

  // Find the span that holds the value after "Demo service:"
  const el =
    document.getElementById("demoServiceMeta") ||
    document.querySelector("[data-demo-service-meta]");

  if (!el) {
    UI.warn("[UI] updateDemoServiceMeta(): meta element not found");
    return;
  }

  // No data case
  if (!Array.isArray(checkRows) || checkRows.length === 0) {
    el.textContent = "no checks yet.";
    UI.log("[UI] updateDemoServiceMeta(): applied", {
      total: 0,
      failures: 0,
      text: el.textContent,
    });
    return;
  }

  const total = checkRows.length;

  // Count failures: anything not an explicit PASS
  const failures = checkRows.filter((c) => {
    const status = (c.status || "").toString().toUpperCase();
    return status !== "PASS";
  }).length;

  let text;
  if (failures > 0) {
    text = `${failures}/${total} checks FAILING`;
  } else {
    text = `all ${total} checks PASSED`;
  }

  el.textContent = text;

  UI.log("[UI] updateDemoServiceMeta(): applied", {
    total,
    failures,
    text,
  });
}

  // Optional: latency if present
const ms =
  latest.duration_ms ??
  (latest.details &&
    (latest.details.elapsedMs || latest.details.elapsed_ms));

if (ms != null) {
  el.textContent =
    `Demo service: healthy (${total}/${total} checks pass, last ${ms}ms)`;
} else {
  el.textContent =
    `Demo service: healthy (${total}/${total} checks pass)`;
}

UI.updateDemoServiceMeta = updateDemoServiceMeta;

// Make these functions visible to app.js (global scope in the browser)
if (typeof window !== "undefined") {
  window.updateSummaryCards = updateSummaryCards;
  window.updateRecentRunsTable = updateRecentRunsTable;
  window.updateFailuresTable = updateFailuresTable;
  window.updateSummaryStatus = updateSummaryStatus;
  window.updateDemoServiceMeta = updateDemoServiceMeta;
}


