console.log("[UI] ui.js loaded (20260110g signature)");
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
const UI = window.UI; // local alias, so "UI.log(...)" works reliably

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
  // Keep ONE lightweight log so we can confirm it fires without spamming
  UI.log("[UI] updateFailuresTable()", {
    len: Array.isArray(failures) ? failures.length : 0,
  });

  const table = document.getElementById("failTable");
  const body = document.getElementById("failBody");
  const span = document.getElementById("failSpan");

  if (!table || !body) {
    UI.warn("updateFailuresTable()", "failTable or failBody not found");
    return;
  }

  const rows = Array.isArray(failures) ? failures : [];

  // Clear existing rows
  body.innerHTML = "";

  // Empty-state: no failures
  if (rows.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    // 7 columns: time, runId, phase, principle, rule, severity, message
    td.colSpan = 7;
    td.classList.add("empty-state");
    td.innerHTML = `
      <div class="empty-message">
        <strong>No governance failures in this window ✅</strong><br/>
        <span>All checks passed during the selected period.</span>
      </div>
    `;

    tr.appendChild(td);
    body.appendChild(tr);

    if (span) span.textContent = "0 flat failures";
    return;
  }

  // Render failures
  rows.forEach((f) => {
    const tr = document.createElement("tr");

    const cells = [
      f?.time ?? "—",
      f?.runId ?? "—",
      f?.phase ?? "—",
      f?.principle ?? "—",
      f?.rule ?? "—",
      f?.severity ?? "—",
      f?.message ?? "—",
    ];

    cells.forEach((value, idx) => {
      const td = document.createElement("td");
      td.textContent = String(value);

      // Right-align severity (kept consistent with your existing styling approach)
      if (idx === 5) td.classList.add("right");

      tr.appendChild(td);
    });

    body.appendChild(tr);
  });

  if (span) span.textContent = `${rows.length} flat failures`;
}

// Harness: repair status line (Option A)
function setHarnessRepairStatus(text) {
  const el = document.getElementById("harnessRepairStatus");
  if (!el) return;

  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }

  el.style.display = "block";
  el.textContent = text;
}
window.setHarnessRepairStatus = setHarnessRepairStatus;

function updateRecentActionsTable(actionRows) {
  const rows = Array.isArray(actionRows) ? actionRows : [];

  const tbody = document.getElementById("actionsRows");
  const countEl = document.getElementById("actionsCount");
  const emptyEl = document.getElementById("actionsEmpty");

  if (!tbody) {
    UI.warn("updateRecentActionsTable()", "actionsRows tbody not found");
    return;
  }

  // Count + empty state
  if (countEl) countEl.textContent = String(rows.length);
  if (emptyEl) emptyEl.style.display = rows.length ? "none" : "block";

  // Clear existing
  tbody.innerHTML = "";

  // Helper: safe text
  const t = (v, fallback = "—") =>
    v === null || v === undefined || v === "" ? fallback : String(v);

  const fmtTime = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    return isNaN(d.getTime()) ? String(ts) : d.toLocaleString();
  };

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const cells = [
      fmtTime(r.requested_at),
      t(r.action_type),
      t(r.max_severity),
      t(r.approval_status),
      t(r.execution_status),
      t(r.verification_status),
      t(r.run_label),
    ];

    cells.forEach((val) => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
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
  const cfg = window.ILLARA_CFG || {};
  const enabled = cfg.DEMO_SERVICE_ENABLED === true;

  // Try a couple of possible element IDs so we don't depend on one name
  const el =
    document.getElementById("demoServiceMeta") ||   // new preferred id
    document.getElementById("demoHealth") ||        // old id, for compatibility
    document.getElementById("harnessDemoServiceMeta") ||
    document.querySelector("[data-harness-demo-service]");

  if (!el) {
    UI.warn("updateDemoServiceMeta(): demo service element not found");
    return;
  }

  // If demo service isn't configured, don't mislead with "no checks yet"
  if (!enabled) {
    el.textContent = "Demo service: disabled";
    return;
  }

  // If there's no data, show a friendly default.
  if (!Array.isArray(checkRows) || checkRows.length === 0) {
    el.textContent = "Demo service: no checks yet.";
    UI.log("[UI] updateDemoServiceMeta(): no data", { count: 0 });
    return;
  }

  const total = checkRows.length;
  const failures = checkRows.filter((c) => {
    const status = (c.status || "").toString().toUpperCase();
    return status !== "PASS";
  }).length;

  // Optional: latency if present (newest-first)
  const latest = checkRows[0];
  const ms =
    latest?.duration_ms ??
    (latest?.details && (latest.details.elapsedMs || latest.details.elapsed_ms));

  let text;
  if (failures > 0) {
    text = `Demo service: ${failures}/${total} checks FAILING`;
  } else {
    text = ms != null
      ? `Demo service: healthy (${total}/${total} checks pass, last ${ms}ms)`
      : `Demo service: healthy (${total}/${total} checks PASS)`;
  }

  el.textContent = text;

  UI.log("[UI] updateDemoServiceMeta(): applied", { total, failures, text, ms });
}

UI.updateDemoServiceMeta = updateDemoServiceMeta;

// Make these functions visible to app.js (global scope in the browser)
if (typeof window !== "undefined") {
  window.updateSummaryCards = updateSummaryCards;
  window.updateRecentRunsTable = updateRecentRunsTable;
  window.updateFailuresTable = updateFailuresTable;
  window.updateSummaryStatus = updateSummaryStatus;
  window.updateDemoServiceMeta = updateDemoServiceMeta;
  window.updateRecentActionsTable = updateRecentActionsTable;
}
// Bulletproof: bind now and again on next tick (covers late overwrites)
(function bindFailuresTable() {
  if (typeof window === "undefined") return;

  const bind = () => {
    console.log("[UI] Bound window.updateFailuresTable to ui.js implementation");
  };

  bind();
  window.addEventListener("load", bind);
})();





