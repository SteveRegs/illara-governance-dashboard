// app.js — single-file controller for Illara Governance Dashboard – Phase 2
// For now this file handles BOTH:
//   • fake demo data
//   • DOM updates for the cards and tables
// Supabase wiring will be added here once the UI is stable again.

// ---------------------------------------------------------------------
// 0) Config
// ---------------------------------------------------------------------

// While we’re debugging, keep the dashboard in FAKE mode.
// Later we’ll flip this to false and plug in real Supabase fetches.
const USE_FAKE_DATA = false;

// Read any config injected by env.public.js (Supabase URL / anon key, etc.)
function getCfg() {
  const cfg =
    window.ILLARA_CFG ||
    window.ILLARA_ENV ||
    window.ENV_PUBLIC ||
    null;

  if (!cfg) {
    return { SUPABASE_URL: null, SUPABASE_ANON_KEY: null };
  }

  return {
    ...cfg,
    SUPABASE_URL: cfg.SUPABASE_URL || cfg.supabaseUrl || null,
    SUPABASE_ANON_KEY: cfg.SUPABASE_ANON_KEY || cfg.supabaseAnonKey || null,
  };
}

// ---------------------------------------------------------------------
// 2) DOM helpers (summary cards + tables)
// ---------------------------------------------------------------------

function updateSummaryCards(summary) {
  UI.log("updateSummaryCards()", summary);

  const runsEl = document.getElementById("runsCount");
  const passEl = document.getElementById("passRatePill");
  const failEl = document.getElementById("failCount");
  const uniqueEl = document.getElementById("uniqueRules");

  if (!runsEl && !passEl && !failEl && !uniqueEl) {
    UI.warn("updateSummaryCards()", "summary card elements not found");
    return;
  }

  if (!summary) {
    if (runsEl) runsEl.textContent = "–";
    if (passEl) passEl.textContent = "Pass rate: –";
    if (failEl) failEl.textContent = "–";
    if (uniqueEl) uniqueEl.textContent = "– unique rules";
    return;
  }

  if (runsEl) runsEl.textContent = String(summary.runsInWindow ?? "–");

  if (passEl) {
    const pct =
      typeof summary.passRate === "number"
        ? Math.round(summary.passRate * 100)
        : null;
    passEl.textContent = pct === null ? "Pass rate: –" : `Pass rate: ${pct}%`;
  }

  if (failEl) failEl.textContent = String(summary.failuresInWindow ?? 0);
  if (uniqueEl) {
    uniqueEl.textContent = `${summary.uniqueRules ?? 0} unique rules`;
  }
}

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

function updateFailuresTable(failures) {
  UI.log("updateFailuresTable()", failures);

  const table = document.getElementById("failTable");
  const body = document.getElementById("failBody");
  const span = document.getElementById("failSpan");

  if (!table || !body) {
    UI.warn("updateFailuresTable()", "failTable or failBody not found");
    return;
  }

}
  function updateRecentActionsTable(actions) {
  UI.log("updateRecentActionsTable()", actions);

  const body = document.getElementById("actionsRows");
  const countSpan = document.getElementById("actionsCount");
  const empty = document.getElementById("actionsEmpty");

  if (!body) {
    UI.warn("updateRecentActionsTable()", "actionsRows not found");
    return;

  }
 
  
  const rows = Array.isArray(actions) ? actions : [];

  // Count + empty state
  if (countSpan) countSpan.textContent = String(rows.length);
  if (empty) empty.style.display = rows.length ? "none" : "block";

  // Build rows
  body.innerHTML = rows
    .slice(0, 10)
    .map((r) => {
      const t = r.requested_at ? new Date(r.requested_at).toLocaleString() : "—";
      const actionType = r.action_type ?? "—";
      const maxSev = r.max_severity ?? r.priority ?? "—";
      const approval = r.approval_status ?? "—";
      const exec = r.execution_status ?? "—";
      const verify = r.verification_status ?? "—";
      const runLabel = r.run_label ?? "—";

      return `
        <tr>
          <td>${t}</td>
          <td>${actionType}</td>
          <td>${maxSev}</td>
          <td>${approval}</td>
          <td>${exec}</td>
          <td>${verify}</td>
          <td>${runLabel}</td>
        </tr>
      `;
    })
    .join("");
}


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

      // Right-align severity if you like
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


function updateTrendSection(recentRuns) {
  const spark = document.getElementById("trendSpark");
  const caption = document.getElementById("trendCaption");

  UI.log("[APP] updateTrendSection(): enter", {
    hasSpark: !!spark,
    hasCaption: !!caption,
    isArray: Array.isArray(recentRuns),
    recentCount: Array.isArray(recentRuns) ? recentRuns.length : null,
  });

  // Guard: no DOM nodes
  if (!spark || !caption) {
    UI.log("[APP] updateTrendSection(): missing DOM nodes, aborting");
    return;
  }

  // Guard: no or too little data
  if (!Array.isArray(recentRuns) || recentRuns.length < 2) {
    spark.innerHTML = "";
    caption.textContent = "Trend: Not enough data to compute trend yet.";
    UI.log("[APP] updateTrendSection(): not enough recentRuns, aborting");
    return;
  }

  // Oldest → newest so the line flows left → right
  const runs = [...recentRuns].sort((a, b) => {
    const aTime = new Date(
      a.time || a.run_started_at || a.created_at || a.inserted_at || 0
    ).getTime();
    const bTime = new Date(
      b.time || b.run_started_at || b.created_at || b.inserted_at || 0
    ).getTime();
    return aTime - bTime;
  });

  // Try passRate (UI field); fall back to checks/failures
  const passRates = runs
    .map((run) => {
      if (typeof run.passRate === "number") {
        return run.passRate;
      }

      if (typeof run.checks === "number" && run.checks > 0) {
        const failures = typeof run.failures === "number" ? run.failures : 0;
        const passed = Math.max(0, run.checks - failures);
        return (passed / run.checks) * 100;
      }

      return null;
    })
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  UI.log("[APP] updateTrendSection(): computed passRates", {
    passRatesCount: passRates.length,
    passRatesSample: passRates.slice(0, 5),
  });

  // Guard: not enough numeric datapoints
  if (passRates.length < 2) {
    spark.innerHTML = "";
    caption.textContent = "Trend: Not enough data to compute trend yet.";
    UI.log("[APP] updateTrendSection(): not enough passRates, aborting");
    return;
  }

  // Cap to last N points so it stays readable
  const maxPoints = 20;
  const sliced =
    passRates.length > maxPoints
      ? passRates.slice(passRates.length - maxPoints)
      : passRates;

  const oldest = sliced[0];
  const newest = sliced[sliced.length - 1];
  const delta = newest - oldest;

  // Direction logic with small tolerance
  const threshold = 1; // 1 percentage point
  let direction = "flat";
  if (delta > threshold) direction = "up";
  else if (delta < -threshold) direction = "down";

  const descriptor =
    direction === "up"
      ? "improving"
      : direction === "down"
      ? "declining"
      : "stable";

  // SVG geometry
  const width = 100;
  const height = 40;
  const padding = 4;

  const max = Math.max(...sliced);
  const min = Math.min(...sliced);
  const span = max - min || 1;

  const pointsAttr = sliced
    .map((value, index) => {
      const x =
        sliced.length === 1
          ? width / 2
          : (index / (sliced.length - 1)) * (width - padding * 2) +
            padding;

      const normalized = (value - min) / span; // 0–1
      const y =
        height - padding - normalized * (height - padding * 2); // invert Y

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Draw the polyline
  spark.setAttribute("viewBox", `0 0 ${width} ${height}`);
  spark.innerHTML = `
    <polyline
      class="trend-line trend-line-${direction}"
      fill="none"
      points="${pointsAttr}"
    />
  `;

  // Caption text
  const deltaText = `${delta >= 0 ? "+" : ""}${delta.toFixed(
    1
  )} pts vs earliest run in window`;

  caption.textContent = `Trend: Pass rate ${descriptor} — current ${newest.toFixed(
    1
  )}% (${deltaText}, based on ${sliced.length} runs).`;

  UI.log("[APP] updateTrendSection(): updated DOM", {
    direction,
    newest,
    delta,
    count: sliced.length,
  });
}

function updateHarnessSection(latestRun, recentRuns) {
  const card = document.getElementById("harnessCard");
  const statusEl = document.getElementById("harnessStatus");
  const metaEl = document.getElementById("harnessMeta");
  const historyEl = document.getElementById("harnessHistory");

  if (!card) return;

  // --- No data yet ---
  if (!latestRun) {
    card.classList.remove("is-pass", "is-fail");
    if (statusEl) statusEl.textContent = "Status: —";
    if (metaEl) metaEl.textContent = "No harness runs recorded yet.";
    if (historyEl) historyEl.textContent = "Recent: —";
    return;
  }

  // --- Basic fields from latest run ---
  const status = (latestRun.overall_status || "UNKNOWN").toUpperCase();
  const env = latestRun.environment || "unknown";
  const total = latestRun.total_checks ?? 0;
  const failed = latestRun.failed_checks ?? 0;

  // --- Convert timestamps to local time ---
  const startedLocal = latestRun.started_at
    ? new Date(latestRun.started_at).toLocaleString()
    : "—";
  const finishedLocal = latestRun.finished_at
    ? new Date(latestRun.finished_at).toLocaleString()
    : "—";

  // --- Card styling by status ---
  card.classList.remove("is-pass", "is-fail");
  if (status === "PASS") {
    card.classList.add("is-pass");
  } else if (status === "FAIL") {
    card.classList.add("is-fail");
  }

  // --- Main status line ---
  if (statusEl) {
    statusEl.textContent = `Status: ${status}`;
  }

  // --- Meta line (env, checks, timestamps) ---
  if (metaEl) {
    metaEl.textContent =
      `Env: ${env} • Checks: ${total}, Failed: ${failed}` +
      ` • Started: ${startedLocal} • Finished: ${finishedLocal}`;
  }

  // --- History line: last few harness runs ---
  if (historyEl) {
    let historyText = "Recent: —";

    if (Array.isArray(recentRuns) && recentRuns.length > 0) {
      const pieces = recentRuns.slice(0, 5).map((run) => {
        const t = run.started_at
          ? new Date(run.started_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—";
        const s = (run.overall_status || "?").toUpperCase();
        return `${t} • ${s}`;
      });

      historyText = `Recent: ${pieces.join(" | ")}`;
    }

    historyEl.textContent = historyText;
  }
}

// ---------------------------------------------------------------------
// 3) Fake demo data
// ---------------------------------------------------------------------

function runFakeMode() {
  UI.log("runFakeMode()");

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

  updateSummaryCards(fakeSummary);
  updateRecentRunsTable(fakeRuns);
  updateFailuresTable(fakeFailures);
}

// ---------------------------------------------------------------------
// 4) Future: REAL mode (Supabase)
// ---------------------------------------------------------------------
//
// For now, we’re *not* calling Supabase from here — just wiring the
// structure so we can drop the real fetches in later.

async function runRealMode(cfg) {
  UI.log("runRealMode()", cfg);

  // Placeholder: when we wire Supabase, we’ll:
  //   1. fetch summary metrics
  //   2. fetch recent runs
  //   3. fetch failures (flat)
  //
  // For now, just fall back to FAKE so the UI shows something.
  runFakeMode();
}

// Shared Supabase fetch helper for REAL mode
async function safeSupabaseFetch(label, url, cfg) {
  UI.log("[APP][SUPABASE] starting", { label, url });

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      UI.warn("[APP][SUPABASE] non-OK response", {
        label,
        status: res.status,
        url,
        body: text,
      });
      return [];
    }

    const json = await res.json();

    if (!Array.isArray(json)) {
      UI.warn("[APP][SUPABASE] JSON was not an array", {
        label,
        json,
      });
      return [];
    }

    UI.log("[APP][SUPABASE] rows", {
      label,
      count: json.length,
      sample: json.slice(0, 3),
    });

    return json;
  } catch (err) {
    UI.error("[APP][SUPABASE] fetch error", { label, url, err });
    return [];
  }
}

// Main dashboard summary — governance_reports
async function fetchSummaryFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/governance_reports?select=*`;
  return safeSupabaseFetch("governance_reports", url, cfg);
}

// Main dashboard "Recent Runs" --- use governance_recent
async function fetchRecentRunsFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/governance_recent` +
    `?select=*` +
    `&order=generated_at.desc` +   // <-- this column actually exists
    `&limit=50`;

  return safeSupabaseFetch("governance_recent", url, cfg);
}

// Demo Service health checks — from test_checks DEMO_HEALTH_* rows
async function fetchDemoServiceChecksFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?select=*` +
    `&check_name=like.DEMO_HEALTH_%25` + // filter by DEMO_HEALTH_* prefix
    `&order=created_at.desc` +
    `&limit=10`;

  // safeSupabaseFetch will log 400s etc. for us
  return safeSupabaseFetch("demo_service_checks", url, cfg);
}

async function fetchHarnessRecentRunsFromSupabase(cfg) {
  // Harness card history – use harness_recent
  const url = `${cfg.SUPABASE_URL}/rest/v1/harness_recent?select=*&order=started_at.desc&limit=5`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[HARNESS] fetchHarnessRecentRunsFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    UI.log("[HARNESS] fetchHarnessRecentRunsFromSupabase(): rows", rows);

    // Update the "Recent:" line in the Harness card
    const historyEl = document.getElementById("harnessHistory");
    if (historyEl) {
      if (!rows || rows.length === 0) {
        historyEl.textContent = "Recent: —";
      } else {
        const labels = rows.map((row) => {
          // from harness_recent: overall_status + failure_severity
          if (row.overall_status === "PASS") return "PASS";
          const sev = (row.failure_severity || "").toLowerCase();
          return sev ? `FAIL (${sev})` : "FAIL";
        });

        historyEl.textContent = `Recent: ${labels.join(", ")}`;
      }
    }

    return rows;
  } catch (err) {
    UI.error(
      "[HARNESS] fetchHarnessRecentRunsFromSupabase(): error",
      err
    );
    return [];
  }
}

// Demo Service health -- demo_service_recent
async function fetchDemoServiceRecentFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/demo_service_recent?select=*`;
  return safeSupabaseFetch("demo_service_recent", url, cfg);
}

// --- Demo Service health checks (from test_checks) ---
async function fetchDemoHealthChecksFromSupabase(cfg) {
  // Grab the last few DEMO_HEALTH_* checks
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?check_name=like.DEMO_HEALTH_%25&order=created_at.desc&limit=5`;

  return safeSupabaseFetch("demo_health_checks", url, cfg);
}


async function fetchDemoHealthChecksForRunFromSupabase(cfg, runId) {
  if (!runId) {
    UI.warn(
      "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): missing runId",
      { runId }
    );
    return [];
  }

  const url =
    `${cfg.SUPABASE_URL}/rest/v1/test_checks` +
    `?run_id=eq.${encodeURIComponent(runId)}` +
    `&order=created_at.asc`;

  UI.log("[DEMO] fetchDemoHealthChecksForRunFromSupabase(): starting", { url });

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    UI.log(
      "[DEMO] fetchDemoHealthChecksForRunFromSupabase(): rows",
      { count: rows.length, sample: rows.slice(0, 3) }
    );

    // Only keep the demo_service_health checks
    return rows.filter(
      (r) => r.details && r.details.source === "demo_service_health"
    );
  } catch (err) {
    UI.error("[DEMO] fetchDemoHealthChecksForRunFromSupabase(): error", err);
    return [];
  }
}

async function fetchFailuresFromSupabase(cfg) {
  // NOTE: no order clause yet – keep it simple until we confirm columns
  const url = `${cfg.SUPABASE_URL}/rest/v1/governance_failures_flat?select=*&limit=100`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: cfg.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      UI.warn(
        "[APP] fetchFailuresFromSupabase(): response not OK",
        res.status
      );
      return [];
    }

    const rows = await res.json();
    UI.log("[APP] fetchFailuresFromSupabase(): rows", rows);
    return rows;
  } catch (err) {
    UI.error("[APP] fetchFailuresFromSupabase(): error", err);
    return [];
  }
}

// === HARNESS: fetch latest test_runs row ===
async function fetchHarnessLatestRunFromSupabase(cfg) {
  const url = `${cfg.SUPABASE_URL}/rest/v1/test_runs` +
    `?select=*` +
    `&order=started_at.desc` +
    `&limit=1`;

  UI.log("[HARNESS] fetchHarnessLatestRunFromSupabase(): starting", { url });

  const res = await fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    UI.log("[HARNESS] fetchHarnessLatestRunFromSupabase(): HTTP error", {
      status: res.status,
      statusText: res.statusText,
      body: text,
    });
    throw new Error(`Harness fetch failed: ${res.status} ${res.statusText}`);
  }

  const rows = await res.json();
  UI.log("[HARNESS] fetchHarnessLatestRunFromSupabase(): rows", {
    count: Array.isArray(rows) ? rows.length : null,
    sample: Array.isArray(rows) ? rows[0] : null,
  });

  // Either the latest row, or null if table is still truly empty
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0];
}

// === HARNESS: fetch last few runs for history line ===
async function fetchHarnessRecentRunsFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/harness_recent` +
    `?select=run_id,started_at,finished_at,overall_status` +
    `&order=started_at.desc&limit=5`;

  UI.log("[HARNESS] fetchHarnessRecentRunsFromSupabase(): starting", { url });

  const res = await fetch(url, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${cfg.SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    UI.log("[HARNESS] fetchHarnessRecentRunsFromSupabase(): HTTP error", {
      status: res.status,
      statusText: res.statusText,
    });
    return [];
  }

  const rows = await res.json();
  UI.log("[HARNESS] fetchHarnessRecentRunsFromSupabase(): rows", {
    count: rows?.length,
    sample: Array.isArray(rows) ? rows.slice(0, 3) : null,
  });

  return Array.isArray(rows) ? rows : [];
}

// Recent Actions — from repair_action_runs_recent_v1
async function fetchRecentActionsFromSupabase(cfg) {
  const url =
    `${cfg.SUPABASE_URL}/rest/v1/repair_action_runs_recent_v1` +
    `?select=%2A` +
    `&order=requested_at.desc` +
    `&limit=10`;

  return safeSupabaseFetch("repair_action_runs_recent_v1", url, cfg);
}

// ---------------------------------------------------------
// Summary helpers (rows -> metrics)
// ---------------------------------------------------------

function computeRunsInWindowFromRows(summaryRow, recentRuns) {
  // Prefer explicit summary value if present
  const fromSummary =
    summaryRow?.runs_in_window ??
    summaryRow?.runsInWindow ??
    summaryRow?.runs ??
    null;

  if (typeof fromSummary === "number" && !Number.isNaN(fromSummary)) {
    return fromSummary;
  }

  // Fallback: number of runs
  const safeRuns = Array.isArray(recentRuns) ? recentRuns : [];
  return safeRuns.length;
}

function computeFailuresInWindowFromRows(summaryRow, recentRuns, failuresRows) {
  // Prefer explicit summary value if present
  const fromSummary =
    summaryRow?.failures_in_window ??
    summaryRow?.failuresInWindow ??
    summaryRow?.failures ??
    null;

  if (typeof fromSummary === "number" && !Number.isNaN(fromSummary)) {
    return fromSummary;
  }

  // Fallback: total failures from runs table
  const safeRuns = Array.isArray(recentRuns) ? recentRuns : [];
  const totalFromRuns = safeRuns.reduce((acc, r) => {
    const fails =
      r.failures ??
      r.failure_count ??
      0;
    return acc + (Number(fails) || 0);
  }, 0);

  if (totalFromRuns > 0) {
    return totalFromRuns;
  }

  // Last fallback: count of failure rows
  const safeFailures = Array.isArray(failuresRows) ? failuresRows : [];
  return safeFailures.length;
}

function computePassRateFromRows(summaryRow, recentRuns) {
  // Prefer explicit summary value if present (0–1 fraction)
  const fromSummary =
    summaryRow?.pass_rate ??
    summaryRow?.passRate ??
    summaryRow?.pass_ratio ??
    null;

  if (typeof fromSummary === "number" && !Number.isNaN(fromSummary)) {
    return fromSummary;
  }

  // Fallback: 1 - (totalFailures / totalChecks)
  const safeRuns = Array.isArray(recentRuns) ? recentRuns : [];
  const totals = safeRuns.reduce(
    (acc, r) => {
      const checks =
        r.checks ??
        r.total_checks ??
        r.check_count ??
        0;
      const fails =
        r.failures ??
        r.failure_count ??
        0;

      acc.checks += Number(checks) || 0;
      acc.failures += Number(fails) || 0;
      return acc;
    },
    { checks: 0, failures: 0 }
  );

  if (totals.checks <= 0) {
    return 0;
  }

  return 1 - totals.failures / totals.checks;
}

function computeUniqueRulesFromRows(summaryRow, failuresRows) {
  // Prefer explicit summary value if present
  const fromSummary =
    summaryRow?.unique_rules ??
    summaryRow?.uniqueRules ??
    summaryRow?.rules ??
    null;

  if (typeof fromSummary === "number" && !Number.isNaN(fromSummary)) {
    return fromSummary;
  }

  // Fallback: distinct rule codes in failures
  const safeFailures = Array.isArray(failuresRows) ? failuresRows : [];
  const ruleSet = new Set(
    safeFailures
      .map((f) => f.rule ?? f.rule_code ?? null)
      .filter(Boolean)
  );

  return ruleSet.size;
}

function updateDemoHealthLine(rows) {
  const el = document.getElementById("demoHealth");
  if (!el) return;

  if (!rows || rows.length === 0) {
    el.textContent = "Demo service: —";
    return;
  }

  const total = rows.length;
  const failed = rows.filter((r) => r.status === "FAIL").length;

  const durations = rows
    .map((r) => r.duration_ms)
    .filter((v) => typeof v === "number" && !Number.isNaN(v));

  const avgMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  if (failed === 0) {
    const base = `Demo service: PASS (${total}/${total} checks`;
    el.textContent =
      avgMs != null ? `${base}, ~${avgMs}ms)` : `${base})`;
  } else {
    el.textContent = `Demo service: FAIL (${failed}/${total} checks failed)`;
  }
}

// ---------------------------------------------------------
// Mapping helpers: Supabase rows -> UI shapes
// ---------------------------------------------------------

// Derive summary stats from UI-mapped runs + failures
function buildSummaryFromRows(runs, failures) {
  // Debug: see exactly what we’re getting
  UI.log("[DEBUG] buildSummaryFromRows(): raw runs", runs);
  UI.log("[DEBUG] buildSummaryFromRows(): raw failures", failures);

  // Ensure we always work with arrays
  const safeRuns = Array.isArray(runs) ? runs : [];
  const safeFailures = Array.isArray(failures) ? failures : [];

  // Window metrics
  const runsInWindow = safeRuns.length;
  const failuresInWindow = safeFailures.length;

  // Unique rules across all failures
  const uniqueRules = new Set(
    safeFailures
      .map((f) => f.rule)
      .filter((rule) => typeof rule === "string" && rule.length > 0)
  ).size;

  // Pass-rate = (# runs with 0 failures) / (total runs)
  let passRate = 0;
  if (runsInWindow > 0) {
    const passedRuns = safeRuns.filter((run) => {
      const failuresCount =
        typeof run.failures === "number" ? run.failures : 0;
      return failuresCount === 0;
    }).length;

    passRate = passedRuns / runsInWindow; // 0–1
  }

  // Last run time: first run in the mapped array, if present
  const lastRunAt =
    safeRuns.length > 0 && safeRuns[0].time ? safeRuns[0].time : null;

  const summary = {
    runsInWindow,
    failuresInWindow,
    uniqueRules,
    passRate,
    lastRunAt,
  };

  UI.log("[APP] buildSummaryFromRows()", summary);
  return summary;
}

function mapRecentRunRow(row) {
  const mapped = {
    time:
      row.time ??
      row.run_time ??
      row.created_at ??
      "",
    runId:
      row.run_id ??
      row.runId ??
      row.id ??
      "",
    phase:
      row.phase ??
      row.stage ??
      "",
    checks:
      row.checks ??
      row.total_checks ??
      row.check_count ??
      0,
    failures:
      row.failures ??
      row.failure_count ??
      0,
    status:
      row.status ??
      row.result ??
      "",
  };

  return mapped;
}

function mapFailureRow(row) {
  const mapped = {
    time:
      row.time ??
      row.failure_time ??
      row.created_at ??
      "",
    runId:
      row.run_id ??
      row.runId ??
      row.id ??
      "",
    phase:
      row.phase ??
      row.stage ??
      "",
    principle:
      row.principle ??
      row.charter_principle ??
      "",
    rule:
      row.rule ??
      row.rule_code ??
      "",
    severity:
      row.severity ??
      row.level ??
      "",
    message:
      row.message ??
      row.details ??
      row.description ??
      "",
  };

  return mapped;
}

// Main loader: fetch REAL data (or fall-back)
async function loadDashboard() {
  const cfg = getCfg();
  const hasCfg = !!(cfg && cfg.SUPABASE_ANON_KEY);

  UI.log("[APP] loadDashboard(): starting", {
    mode: hasCfg ? "REAL" : "FAKE",
    hasCfg,
    cfg,
  });

  let lastUpdated = null;

  // If we don't have Supabase config, fall back to fake mode
  if (!hasCfg) {
    UI.error("[APP] Missing Supabase config; falling back back to FAKE mode");
    runFakeMode();
    updateSummaryStatus(new Date());
    return;
  }

  try {
    // 1) Pull REAL data from Supabase in parallel
    const [
  summaryRows,
  recentRunRows,
  failureRows,
  demoServiceRows,
  actionRows,
] = await Promise.all([
  fetchSummaryFromSupabase(cfg),
  fetchRecentRunsFromSupabase(cfg),
  fetchFailuresFromSupabase(cfg),
  fetchDemoServiceChecksFromSupabase(cfg),
  fetchRecentActionsFromSupabase(cfg),
]);

    UI.log("[APP] REAL summary rows", summaryRows);
    UI.log("[APP] REAL recent runs rows", recentRunRows);
    UI.log("[APP] REAL failures rows", failureRows);
    UI.log("[APP] REAL demo service rows", demoServiceRows);
    UI.log("[APP] REAL actions rows", actionRows);
    UI.log("[APP] REAL actions rows (sample)", {
  count: Array.isArray(actionRows) ? actionRows.length : null,
  sample: Array.isArray(actionRows) ? actionRows.slice(0, 3) : actionRows,
});

    // 2) Map Supabase rows --> UI shapes
    const recentRuns = (recentRunRows || []).map(mapRecentRunRow);
    const failures = (failureRows || []).map(mapFailureRow);

    UI.log("[APP] mapped recentRuns", {
      count: recentRuns.length,
      sample: recentRuns.slice(0, 3),
    });

    UI.log("[APP] REAL actions rows", { count: actionRows.length, sample: actionRows.slice(0, 3) });

    // 3) Build the window aggregates from the mapped runs + failures
    const summary = buildSummaryFromRows(recentRuns, failures);

    // 4) Derive a "last updated" time
    if (recentRuns.length > 0 && recentRuns[0].time) {
      lastUpdated = new Date(recentRuns[0].time);
    } else {
      lastUpdated = new Date();
    }

    // 5) Push REAL data into the UI
    
    updateSummaryCards(summary);
    updateRecentRunsTable(recentRuns);
    updateFailuresTable(failures);

    if (typeof updateRecentActionsTable === "function") {
    updateRecentActionsTable(actionRows);
    }

    // NEW: update the Demo service line on the harness card
    if (UI.updateDemoServiceMeta) {
      UI.updateDemoServiceMeta(demoServiceRows);
    }

    // NEW: Trend wiring
    UI.log("[APP] loadDashboard(): calling updateTrendSection()", {
      recentRunsCount: recentRuns.length,
    });
    updateTrendSection(recentRuns);

    // HARNESS: load latest test run + recent history
    try {
      const latestHarnessRun = await fetchHarnessLatestRunFromSupabase(cfg);
      const recentHarnessRuns = await fetchHarnessRecentRunsFromSupabase(cfg);

      updateHarnessSection(latestHarnessRun, recentHarnessRuns);

      UI.log("[HARNESS] latest run + history loaded", {
        id: latestHarnessRun && latestHarnessRun.id,
        status: latestHarnessRun && latestHarnessRun.overall_status,
        recentCount: Array.isArray(recentHarnessRuns)
          ? recentHarnessRuns.length
          : 0,
      });
    } catch (hErr) {
      UI.log("[HARNESS] Failed to load latest run + history", hErr);
      updateHarnessSection(null, []);
    }

    UI.log("[APP] updateSummaryStatus() success path", {
      lastUpdated,
    });
  } catch (err) {
    UI.error("[APP] REAL mode failed; falling back back to FAKE mode", err);

    // Fall back to fake mode, but keep the page usable
    runFakeMode();
    updateHarnessSection(null, []);
  }

  // Final: update the "Last updated" pill
  updateSummaryStatus(lastUpdated);
}

// Expose helpers for debugging from the console
window.UI = UI;
window.loadDashboard = loadDashboard;

// Helper to update the refresh button visual state
function setRefreshButtonState(btn, state) {
  if (!btn) return;

  // Clear all state classes first
  btn.classList.remove("is-loading", "is-success", "is-error");

  if (state === "loading") {
    btn.classList.add("is-loading");
    btn.disabled = true;
  } else if (state === "success") {
    btn.classList.add("is-success");
    btn.disabled = false;
  } else if (state === "error") {
    btn.classList.add("is-error");
    btn.disabled = false;
  } else {
    // "idle" / default
    btn.disabled = false;
  }
}

// === HARNESS: manual refresh helper ===
async function refreshHarnessOnly() {
  const btn = document.getElementById("harnessRefreshBtn");
  if (!btn) return;

  setRefreshButtonState(btn, "loading");

  try {
    const cfg = getCfg();
    const latestHarnessRun = await fetchHarnessLatestRunFromSupabase(cfg);
    const recentHarnessRuns = await fetchHarnessRecentRunsFromSupabase(cfg);

    updateHarnessSection(latestHarnessRun, recentHarnessRuns);

    if (typeof window.updateDemoServiceMeta === "function") {
      window.updateDemoServiceMeta([]);
    }

    setRefreshButtonState(btn, "success");
  } catch (err) {
    UI.error("[HARNESS] manual refresh failed", err);

    updateHarnessSection(null, []);
    if (typeof window.updateDemoServiceMeta === "function") {
      window.updateDemoServiceMeta([]);
    }
    setRefreshButtonState(btn, "error");
  } finally {
    setTimeout(() => {
      setRefreshButtonState(btn, "idle");
    }, 1200);
  }
}

// Kick off once the page is ready
window.addEventListener("load", () => {
  const refreshBtn = document.getElementById("refreshBtn");

  // NEW: wire the Test Harness "Re-check" button
  const harnessBtn = document.getElementById("harnessRefreshBtn");
  if (harnessBtn) {
    UI.log("[HARNESS] wiring harnessRefreshBtn click handler", {
      hasHarnessBtn: true,
    });
    harnessBtn.addEventListener("click", refreshHarnessOnly);
  } else {
    UI.log("[HARNESS] no harnessRefreshBtn found on page", {
      hasHarnessBtn: false,
    });
  }

  // Initial load — let loadDashboard handle most errors,
  // but still guard against unexpected ones.
  loadDashboard()
    .catch((e) => {
      UI.error("[APP] Dashboard load error:", e);
    });

  // Wire up the Refresh button, if present
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      UI.log("[APP] Manual refresh clicked");
      setRefreshButtonState(refreshBtn, "loading");

      loadDashboard()
        .then(() => {
          setRefreshButtonState(refreshBtn, "success");
          // Let the green state linger briefly, then return to idle
          setTimeout(() => setRefreshButtonState(refreshBtn, "idle"), 700);
        })
        .catch((err) => {
          UI.error("[APP] Manual refresh failed:", err);
          setRefreshButtonState(refreshBtn, "error");
          // After showing red, go back to idle so user can try again
          setTimeout(() => setRefreshButtonState(refreshBtn, "idle"), 2100);
        });
    });
  }
});







