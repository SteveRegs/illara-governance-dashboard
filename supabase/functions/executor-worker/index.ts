import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function nowIso() {
  return new Date().toISOString();
}
function addMinutesIso(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

function uuidv4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Mode = "dry-run" | "execute";

async function recordInvocation(supabase: any, row: any) {
  try {
    await supabase.from("executor_invocations").insert(row);
  } catch (_e) {
    // Metrics must never break execution.
  }
}

serve(async (req) => {
 if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
 if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

try {
  // Ring-3 gate
  const workerToken = Deno.env.get("ILLARA_WORKER_TOKEN") ?? "";

  if (!workerToken) {
    throw new Error("Missing env var: ILLARA_WORKER_TOKEN");
  }

  const presented = req.headers.get("x-illara-worker-token") ?? "";
  if (!presented || presented !== workerToken) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const body = await req.json().catch(() => ({} as any));
  const mode: Mode = body?.mode === "execute" ? "execute" : "dry-run";

  // Service role DB client (also used to invoke other functions)
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const SUPABASE_URL = requireEnv("SUPABASE_URL");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const WORKER_ID = mode === "execute" ? "executor-worker/execute" : "executor-worker/dry-run";
  const startedPerf = performance.now();
  const LEASE_MINUTES = Number(Deno.env.get("EXECUTOR_LEASE_MINUTES") ?? "8");
  const MAX_ATTEMPTS = Number(Deno.env.get("EXECUTOR_MAX_ATTEMPTS") ?? "3");

  // Find candidates: APPROVED (new work) + EXECUTING with expired lease (reclaim)
  const scanAt = nowIso(); // use the SAME notion of "now" for query + guards

const { data: candidates, error: selErr } = await supabase
  .from("harness_run_requests")
  .select(
    "id, status, created_at, attempt_count, request_payload, requested_run_mode, idempotency_key, run_id, completion_status, claimed_by, lease_expires_at"
  )
  .or(`status.eq.APPROVED,status.eq.EXECUTING`)
  .is("run_id", null)
  .is("completion_status", null)
  .order("created_at", { ascending: true })
  .limit(10);

if (selErr) {
  return json(500, { ok: false, error: "DB read failed", detail: selErr.message });
}

const candidatesCount = candidates?.length ?? 0;

if (!candidates || candidates.length === 0) {
  await recordInvocation(supabase, {
    worker_id: WORKER_ID,
    mode,
    candidates_considered: 0,
    claim_acquired: false,
    outcome: "NO_CANDIDATES",
    duration_ms: Math.round(performance.now() - startedPerf),
    meta: { reason: "no_candidates_query_returned_empty" },
  });

  return json(200, {
    ok: true,
    mode,
    message: "No candidate requests found (APPROVED or EXECUTING w/ expired lease; run_id+completion_status NULL).",
    processed: null,
    candidates_considered: 0,
  });
}
    // Claim one row atomically:
    // - CLAIM:    APPROVED  -> EXECUTING
    // - RECLAIM:  EXECUTING (expired lease) -> EXECUTING (new lease + claimant)
    const claimToken = uuidv4(); // local tracing only
    const leaseExpiresAt = addMinutesIso(LEASE_MINUTES);

    let claimed: any = null;
    let claimKind: "CLAIM" | "RECLAIM" = "CLAIM";
    let priorClaimedBy: string | null = null;
    let priorLeaseExpiresAt: string | null = null;

    for (const c of candidates) {
  // Idempotency: refuse to execute if run_id already exists
  if (c.run_id) continue;

  const decisionAt = scanAt; // use ONE timestamp for all guards in this scan pass

  // Attempts cap (applies to both new work and reclaim)
  if ((c.attempt_count ?? 0) >= MAX_ATTEMPTS) {
    if (c.status === "APPROVED") {
      const { error: failErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "FAILED",
          execution_finished_at: decisionAt,
          completion_status: "failed",
          error_code: "MAX_ATTEMPTS_EXCEEDED",
          error_detail: { max_attempts: MAX_ATTEMPTS },
        })
        .eq("id", c.id)
        .eq("status", "APPROVED");

      if (failErr) return json(500, { ok: false, error: "DB fail-hard failed", detail: failErr.message });

      await supabase.from("harness_request_events").insert({
        request_id: c.id,
        event_type: "FAILED",
        actor_type: "executor",
        actor_id: WORKER_ID,
        actor_label: WORKER_ID,
        from_status: "APPROVED",
        to_status: "FAILED",
        meta: { reason: "max_attempts_exceeded", max_attempts: MAX_ATTEMPTS },
      });

      continue;
    }

    if (c.status === "EXECUTING") {
      const { error: failErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "FAILED",
          execution_finished_at: decisionAt,
          completion_status: "failed",
          error_code: "MAX_ATTEMPTS_EXCEEDED",
          error_detail: { max_attempts: MAX_ATTEMPTS },
          claimed_at: null,
          claimed_by: null,
          lease_expires_at: null,
        })
        .eq("id", c.id)
        .eq("status", "EXECUTING")
        .lt("lease_expires_at", decisionAt); // only if expired at decision time

      if (failErr) return json(500, { ok: false, error: "DB fail-hard failed", detail: failErr.message });

      await supabase.from("harness_request_events").insert({
        request_id: c.id,
        event_type: "FAILED",
        actor_type: "executor",
        actor_id: WORKER_ID,
        actor_label: WORKER_ID,
        from_status: "EXECUTING",
        to_status: "FAILED",
        meta: { reason: "max_attempts_exceeded", max_attempts: MAX_ATTEMPTS },
      });

      continue;
    }

    continue;
  }

  // Attempts below cap → try claim/reclaim
  const startAt = scanAt;

  if (c.status === "APPROVED") {
    // Normal claim: APPROVED -> EXECUTING
    const { data: updated, error: updErr } = await supabase
      .from("harness_run_requests")
      .update({
        status: "EXECUTING",
        claimed_at: startAt,
        claimed_by: WORKER_ID,
        lease_expires_at: leaseExpiresAt,
        attempt_count: (c.attempt_count ?? 0) + 1,
        execution_started_at: startAt,
      })
      .eq("id", c.id)
      .eq("status", "APPROVED")
      .select(
        "id, status, created_at, attempt_count, claimed_at, claimed_by, lease_expires_at, execution_started_at, request_payload, requested_run_mode, idempotency_key, run_id, completion_status"
      )
      .maybeSingle();

    if (updErr) return json(500, { ok: false, error: "DB claim failed", detail: updErr.message });
    if (updated) {
      claimed = updated;
      claimKind = "CLAIM";
      break;
    }
  }

  if (c.status === "EXECUTING") {
    // Reclaim only if lease is expired (race-safe guard)
    priorClaimedBy = c.claimed_by ?? null;
    priorLeaseExpiresAt = c.lease_expires_at ?? null;

    const { data: updated, error: updErr } = await supabase
      .from("harness_run_requests")
      .update({
        // status remains EXECUTING
        claimed_at: startAt,
        claimed_by: WORKER_ID,
        lease_expires_at: leaseExpiresAt,
        attempt_count: (c.attempt_count ?? 0) + 1,
        // IMPORTANT: do not overwrite execution_started_at on reclaim
      })
      .eq("id", c.id)
      .eq("status", "EXECUTING")
      .lt("lease_expires_at", startAt) // expired at claim time
      .select(
        "id, status, created_at, attempt_count, claimed_at, claimed_by, lease_expires_at, execution_started_at, request_payload, requested_run_mode, idempotency_key, run_id, completion_status"
      )
      .maybeSingle();

    if (updErr) return json(500, { ok: false, error: "DB reclaim failed", detail: updErr.message });
    if (updated) {
      claimed = updated;
      claimKind = "RECLAIM";
      break;
    }
  }
}

    if (!claimed) {
  await recordInvocation(supabase, {
    worker_id: WORKER_ID,
    mode,
    candidates_considered: candidatesCount,
    claim_acquired: false,
    outcome: "NO_CLAIM",
    duration_ms: Math.round(performance.now() - startedPerf),
    meta: {
      reason: "no_claim_acquired_race_or_ineligible",
      max_attempts: MAX_ATTEMPTS,
      lease_minutes: LEASE_MINUTES,
    },
  });

  return json(200, {
    ok: true,
    mode,
    message: "No claim acquired (race or all ineligible). Try again.",
    processed: null,
    candidates_considered: candidatesCount,
  });
}

// We have a claim — derive stable response fields now (used by multiple return paths)
const claim_summary =
  claimKind === "RECLAIM"
    ? "RECLAIM: EXECUTING (expired lease) → EXECUTING (new lease)"
    : "CLAIM: APPROVED → EXECUTING";

const reclaim_context =
  claimKind === "RECLAIM"
    ? {
        prior_claimed_by: priorClaimedBy,
        prior_lease_expires_at: priorLeaseExpiresAt,
      }
    : {};

  // Hard idempotency guard: if already executed/finished, do not run again
if (claimed.run_id || claimed.completion_status) {
  // Recommended audit: no-op due to already finalized
  await supabase.from("harness_request_events").insert({
    request_id: claimed.id,
    event_type: "EXECUTION_SKIPPED_ALREADY_FINALIZED",
    actor_type: "executor",
    actor_id: WORKER_ID,
    actor_label: WORKER_ID,
    from_status: "EXECUTING",
    to_status: "APPROVED",
    meta: {
      reason: "post_claim_idempotency_guard",
      run_id: claimed.run_id ?? null,
      completion_status: claimed.completion_status ?? null,
      claim_token: claimToken,
      claim_kind: claimKind,
    },
  });

  await recordInvocation(supabase, {
    worker_id: WORKER_ID,
    mode,
    candidates_considered: candidatesCount,
    claim_acquired: true,
    claim_kind: claimKind,
    request_id: claimed.id,
    claim_token: claimToken,
    prior_claimed_by: claimKind === "RECLAIM" ? priorClaimedBy : null,
    prior_lease_expires_at: claimKind === "RECLAIM" ? priorLeaseExpiresAt : null,
    outcome: "NOOP_ALREADY_FINALIZED",
    duration_ms: Math.round(performance.now() - startedPerf),
    meta: {
      reason: "post_claim_idempotency_guard",
      run_id: claimed.run_id ?? null,
      completion_status: claimed.completion_status ?? null,
    },
  });

  return json(200, {
    ok: true,
    mode,
    claim_kind: claimKind,
    claim_summary,
    request_id: claimed.id,
    claim_token: claimToken,
    ...reclaim_context,
    message: "Already executed/finalized; released lease (no-op).",
    claimed,
  });
}

    // Audit: CLAIMED/RECLAIMED + EXECUTION_STARTED
const firstEventType = claimKind === "RECLAIM" ? "RECLAIMED" : "CLAIMED";

await supabase.from("harness_request_events").insert([
  {
    request_id: claimed.id,
    event_type: firstEventType,
    actor_type: "executor",
    actor_id: WORKER_ID,
    actor_label: WORKER_ID,
    from_status: claimKind === "RECLAIM" ? "EXECUTING" : "APPROVED",
    to_status: "EXECUTING",
    meta: {
      lease_minutes: LEASE_MINUTES,
      lease_expires_at: leaseExpiresAt,
      claim_token: claimToken,
      ...(claimKind === "RECLAIM"
        ? { prior_claimed_by: priorClaimedBy, prior_lease_expires_at: priorLeaseExpiresAt }
        : {}),
    },
  },
  {
    request_id: claimed.id,
    event_type: "EXECUTION_STARTED",
    actor_type: "executor",
    actor_id: WORKER_ID,
    actor_label: WORKER_ID,
    from_status: "EXECUTING",
    to_status: "EXECUTING",
    meta: { claim_token: claimToken, claim_kind: claimKind },
  },
]);

    // DRY-RUN: release back to APPROVED
    if (mode === "dry-run") {
      const { data: released, error: relErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "APPROVED",
          claimed_at: null,
          claimed_by: null,
          lease_expires_at: null,
          execution_started_at: null,
          // do not touch attempt_count; dry-run is a real claim
          // if you want dry-run not to increment attempts, tell me and we'll adjust.
        })
        .eq("id", claimed.id)
        .eq("status", "EXECUTING")
        .eq("claimed_by", WORKER_ID)
        .select("id, status, attempt_count, claimed_at, claimed_by, lease_expires_at")
        .maybeSingle();

      if (relErr) return json(500, { ok: false, error: "DB release failed", detail: relErr.message });
      if (!released) return json(409, { ok: false, error: "Release guard failed", claimed });

      await supabase.from("harness_request_events").insert({
        request_id: claimed.id,
        event_type: "RETRIED",
        actor_type: "executor",
        actor_id: WORKER_ID,
        actor_label: WORKER_ID,
        from_status: "EXECUTING",
        to_status: "APPROVED",
        meta: { mode: "dry-run", claim_token: claimToken },
      });

      return json(200, {
        ok: true,
        mode,
        claim_kind: claimKind,
        claim_summary,
        request_id: claimed.id,
        claim_token: claimToken,
        ...reclaim_context,
        message: "Claimed request and released back to APPROVED (no execution).",
        claimed,
        released,
       });
     }

    // EXECUTE: invoke harness-run internally
    let execOk = false;
    let execStatus = 0;
    let execJson: any = null;

    try {
      const runMode = claimed.requested_run_mode ?? "recheck";
      const payload = claimed.request_payload ?? {};

      const { data, error } = await supabase.functions.invoke("harness-run", {
        body: {
          request_id: claimed.id,
          run_label: "worker_execute",
          run_mode: runMode,
          idempotency_key: claimed.idempotency_key ?? null,
          ...payload,
        },
      });

      if (error) {
        execOk = false;
        execStatus = 500;
        execJson = { error: "invoke_failed", detail: error.message };
      } else {
        execOk = true;
        execStatus = 200;
        execJson = data;
      }
    } catch (e) {
      execOk = false;
      execStatus = 500;
      execJson = { error: "invoke_exception", detail: String((e as any)?.message ?? e) };
    }

    const finishedAt = nowIso();

    if (execOk) {
      const runId = execJson?.run_id ?? null;

      const { data: completed, error: compErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "COMPLETED",
          execution_finished_at: finishedAt,
          completion_status: "success",
          completion_note: "Executed via harness-run",
          run_id: runId,
          lease_expires_at: null,
        })
        .eq("id", claimed.id)
        .eq("status", "EXECUTING")
        .eq("claimed_by", WORKER_ID)
        .select("id, status, run_id, execution_started_at, execution_finished_at, attempt_count")
        .maybeSingle();

      if (compErr) return json(500, { ok: false, error: "DB finalize (COMPLETED) failed", detail: compErr.message });
      if (!completed) return json(409, { ok: false, error: "Finalize guard failed (COMPLETED)", claimed });

      await supabase.from("harness_request_events").insert({
        request_id: claimed.id,
        event_type: "COMPLETED",
        actor_type: "executor",
        actor_id: WORKER_ID,
        actor_label: WORKER_ID,
        from_status: "EXECUTING",
        to_status: "COMPLETED",
        meta: { run_id: runId, claim_token: claimToken },
      });

      return json(200, {
        ok: true,
        mode,
        claim_kind: claimKind,
        claim_summary,
        request_id: claimed.id,
        claim_token: claimToken,
        ...reclaim_context,
        message: "Executed via harness-run and finalized COMPLETED.",
        claimed,
        executor_http: { status: execStatus, ok: execOk },
        executor_response: execJson,
        finalized: completed,
      });
    } else {

      const { data: failed, error: failErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "FAILED",
          execution_finished_at: finishedAt,
          completion_status: "failed",
          error_code: "RUN_HARNESS_INVOKE_FAILED",
          error_detail: execJson,
          lease_expires_at: null,
        })
        .eq("id", claimed.id)
        .eq("status", "EXECUTING")
        .eq("claimed_by", WORKER_ID)
        .select("id, status, execution_started_at, execution_finished_at, attempt_count")
        .maybeSingle();

      if (failErr) return json(500, { ok: false, error: "DB finalize (FAILED) failed", detail: failErr.message });
      if (!failed) return json(409, { ok: false, error: "Finalize guard failed (FAILED)", claimed });

      await supabase.from("harness_request_events").insert({
        request_id: claimed.id,
        event_type: "FAILED",
        actor_type: "executor",
        actor_id: WORKER_ID,
        actor_label: WORKER_ID,
        from_status: "EXECUTING",
        to_status: "FAILED",
        meta: { error_code: "RUN_HARNESS_INVOKE_FAILED", claim_token: claimToken },
      });

      return json(200, {
        ok: false,
        mode,
        claim_kind: claimKind,
        request_id: claimed.id,
        claim_token: claimToken,
        message: "Execution attempted but harness-run invoke failed; finalized FAILED.",
        claimed,
        executor_http: { status: execStatus, ok: execOk },
        executor_response: execJson,
        finalized: failed,
      });
    }
  } catch (e) {
    return json(500, { ok: false, error: "Unhandled error", detail: String((e as any)?.message ?? e) });
  }
});
