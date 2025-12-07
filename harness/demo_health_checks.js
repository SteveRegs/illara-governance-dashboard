// harness/demo_health_checks.js
//
// Demo health checks for the Illara Demo Service v0.
// This is a local-only integration for now: it calls the service and
// returns structured results. The main harness can then decide how to
// log or store them.
//
// Expected to be called from run_harness.js.
//
// Usage (from run_harness.js):
//   const { runDemoHealthChecks } = require("./demo_health_checks");
//   const demoResults = await runDemoHealthChecks();

const DEMO_SERVICE_URL =
  process.env.DEMO_SERVICE_URL || "http://localhost:4000";

async function callHealth() {
  const url = `${DEMO_SERVICE_URL}/health`;
  const started = performance.now();

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    const elapsed = performance.now() - started;
    return {
      ok: false,
      error: `Network error: ${err.message}`,
      elapsedMs: elapsed,
      status: null,
      body: null,
    };
  }

  const elapsed = performance.now() - started;

  let body = null;
  try {
    body = await res.json();
  } catch (err) {
    return {
      ok: false,
      error: `Failed to parse JSON: ${err.message}`,
      elapsedMs: elapsed,
      status: res.status,
      body: null,
    };
  }

  return {
    ok: res.ok,
    status: res.status,
    body,
    elapsedMs: elapsed,
    error: null,
  };
}

function makeResult(id, description, passed, details) {
  return { id, description, passed, details };
}

async function runDemoHealthChecks() {
  console.log("[DEMO] Running Illara Demo Service health checks...");
  console.log(`[DEMO] Target: ${DEMO_SERVICE_URL}/health`);

  const health = await callHealth();

  if (health.error) {
    const fail = makeResult(
      "DEMO_HEALTH_000",
      "Request succeeded",
      false,
      health.error
    );
    console.log("[DEMO]", fail);
    return [fail];
  }

  const { status, body, elapsedMs } = health;

  const results = [];

  // DEMO_HEALTH_001: status 200
  results.push(
    makeResult(
      "DEMO_HEALTH_001",
      "GET /health returns HTTP 200",
      status === 200,
      `status=${status}`
    )
  );

  // DEMO_HEALTH_002: body.ok === true
  results.push(
    makeResult(
      "DEMO_HEALTH_002",
      "GET /health returns body.ok === true",
      !!(body && body.ok === true),
      `body.ok=${body && body.ok}`
    )
  );

  // DEMO_HEALTH_003: response time < 2000ms
  results.push(
    makeResult(
      "DEMO_HEALTH_003",
      "GET /health responds in under 2000ms",
      elapsedMs < 2000,
      `elapsedMs=${elapsedMs.toFixed(1)}`
    )
  );

  // Log summary
  const passedCount = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(
    `[DEMO] Summary: ${passedCount}/${total} checks passed (last elapsed ≈ ${elapsedMs.toFixed(
      1
    )}ms)`
  );

  // Return structured results so run_harness.js can decide what to do with them.
  return results;
}

module.exports = { runDemoHealthChecks };
