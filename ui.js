// ui.js – presentational render helpers

import { drawSparkline } from "./charts.js";

const $ = sel => document.querySelector(sel);
const tbodyRuns = $("#runsTable tbody");
const tbodyFails = $("#failTable tbody");

export function setFilterOptions({ phases, principles }) {
  const phaseSel = $("#phaseFilter");
  const principleSel = $("#principleFilter");

  const prevPhase = phaseSel.value;
  const prevPrin = principleSel.value;

  phaseSel.innerHTML =
    `<option value="__all">All Phases</option>` +
    phases.map(p => `<option>${escapeHtml(p)}</option>`).join("");

  principleSel.innerHTML =
    `<option value="__all">All Principles</option>` +
    principles.map(p => `<option>${escapeHtml(p)}</option>`).join("");

  if ([...phaseSel.options].some(o=>o.value===prevPhase)) phaseSel.value = prevPhase;
  if ([...principleSel.options].some(o=>o.value===prevPrin)) principleSel.value = prevPrin;
}

export function renderCallout({ newFailuresDetected, newFailCount, latestRun }) {
  const el = $("#callout");
  if (!latestRun) {
    el.className = "callout";
    el.innerHTML = `<strong>Waiting for data…</strong><span class="muted">No runs yet.</span>`;
    return;
  }
  if (newFailuresDetected) {
    el.className = "callout warn";
    el.innerHTML = `
      <strong>New failures detected</strong>
      <span class="muted">Latest run <code>${short(latestRun.run_id)}</code> has ${newFailCount} failing check${plural(newFailCount)}.</span>
    `;
  } else {
    el.className = "callout";
    el.innerHTML = `
      <strong style="color:var(--accent)">All clear</strong>
      <span class="muted">Latest run <code>${short(latestRun.run_id)}</code> passed.</span>
    `;
  }
}

export function renderCards({ runsCount, failCount, passRate, uniqueRules }) {
  $("#runsCount").textContent = nf(runsCount);
  $("#failCount").textContent = nf(failCount);
  $("#uniqueRules").textContent = `${nf(uniqueRules)} unique rules`;
  const pill = $("#passRatePill");
  pill.className = "pill " + (passRate >= 50 ? "pass" : "fail");
  pill.textContent = `Pass rate: ${passRate}%`;
}

export function setTrend(labels, series) {
  const svg = $("#trendSpark");
  drawSparkline(svg, series);
  const caption = $("#trendCaption");
  if (!series.length) caption.textContent = "Trend: no data";
  else {
    const delta = series.at(-1) - series[0];
    const dir = delta === 0 ? "flat" : (delta < 0 ? "improving" : "worsening");
    caption.textContent = `Trend (failures per run): ${series.join(" → ")} (${dir})`;
  }
  $("#runsSpan").textContent = `${labels.length} run${plural(labels.length)} shown`;
}

export function renderRunsTable(rows) {
  tbodyRuns.innerHTML = rows.map(r => `
    <tr>
      <td>${timeago(r.run_ts)}</td>
      <td><code>${short(r.run_id)}</code></td>
      <td>${escapeHtml(r.phase)}</td>
      <td class="right">${nf(r.total_checks)}</td>
      <td class="right">${nf(r.failed_checks)}</td>
      <td>${r.failed_checks>0 ? `<span class="pill fail">fail</span>` : `<span class="pill pass">pass</span>`}</td>
    </tr>
  `).join("");
}

export function renderFailsTable(rows) {
  $("#failSpan").textContent = `${rows.length} failure row${plural(rows.length)}`;
  tbodyFails.innerHTML = rows.map(f => `
    <tr>
      <td>${timeago(f.run_ts)}</td>
      <td><code>${short(f.run_id)}</code></td>
      <td>${escapeHtml(f.phase)}</td>
      <td>${escapeHtml(f.principle)}</td>
      <td>${escapeHtml(f.rule_name || f.rule_id)}</td>
      <td>${escapeHtml(String(f.severity))}</td>
      <td>${escapeHtml(f.message)}</td>
    </tr>
  `).join("");
}

// ----- helpers
function timeago(d){
  const now = new Date();
  const diff = Math.max(0, (now - d)/1000);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleString();
}
function nf(n){ return new Intl.NumberFormat().format(n); }
function short(id){ return String(id).slice(0,8); }
function plural(n){ return n===1 ? "" : "s"; }
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
