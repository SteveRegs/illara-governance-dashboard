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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    // Ring-3 gate
    
   const workerToken =
     Deno.env.get("WORKER_TOKEN") ??
     Deno.env.get("ILLARA_WORKER_TOKEN") ??
     "";

     if (!workerToken) {
       throw new Error("Missing env var: WORKER_TOKEN or ILLARA_WORKER_TOKEN");
 }

     const presented = req.headers.get("x-illara-worker-token") ?? "";

  if (!presented || presented !== workerToken) {
    return json(401, { ok: false, error: "Unauthorized" });
 }

    const body = await req.json().catch(() => ({} as any));
    const mode: Mode = body?.mode === "execute" ? "execute" : "dry-run";

    // Service role DB client (also used to invoke other functions)
    const SR = requireEnv("ILLARA_SERVICE_ROLE_KEY");

    const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    SR,
    { auth: { persistSession: false } }
   );

    // Find APPROVED candidates
    const { data: candidates, error: selErr } = await supabase
      .from("harness_run_requests")
      .select("id, status, created_at, attempt_count")
      .eq("status", "APPROVED")
      .order("created_at", { ascending: true })
      .limit(5);

    if (selErr) return json(500, { ok: false, error: "DB read failed", detail: selErr.message });

    if (!candidates || candidates.length === 0) {
      return json(200, { ok: true, message: "No APPROVED requests to process", processed: null });
    }

    // Claim one row
    const lockToken = uuidv4();
    const lockedBy = mode === "execute" ? "executor-worker/execute" : "executor-worker/dry-run";
    const lockMinutes = 5;

    let claimed: any = null;

    for (const c of candidates) {
      const { data: updated, error: updErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "RUNNING",
          locked_at: nowIso(),
          locked_by: lockedBy,
          lock_token: lockToken,
          lock_expires_at: addMinutesIso(lockMinutes),
          executor_started_at: nowIso(),
          attempt_count: (c.attempt_count ?? 0) + 1,
        })
        .eq("id", c.id)
        .eq("status", "APPROVED")
        .select(
          "id, status, created_at, attempt_count, locked_at, locked_by, lock_token, lock_expires_at, executor_started_at"
        )
        .maybeSingle();

      if (updErr) return json(500, { ok: false, error: "DB claim failed", detail: updErr.message });
      if (updated) {
        claimed = updated;
        break;
      }
    }

    if (!claimed) {
      return json(200, { ok: true, message: "No claim acquired (race). Try again.", processed: null });
    }

    // DRY-RUN: release back to APPROVED
    if (mode === "dry-run") {
      const { data: released, error: relErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "APPROVED",
          locked_at: null,
          locked_by: null,
          lock_token: null,
          lock_expires_at: null,
          executor_finished_at: nowIso(),
        })
        .eq("id", claimed.id)
        .eq("status", "RUNNING")
        .eq("lock_token", lockToken)
        .select("id, status, attempt_count, executor_started_at, executor_finished_at")
        .maybeSingle();

      if (relErr) return json(500, { ok: false, error: "DB release failed", detail: relErr.message });
      if (!released) return json(409, { ok: false, error: "Release guard failed", claimed });

      return json(200, {
        ok: true,
        mode,
        message: "Claimed one APPROVED request and released back to APPROVED (no execution).",
        claimed,
        released,
      });
    }

    // EXECUTE: invoke run-harness internally (no gateway API key)
    let execOk = false;
    let execStatus = 0;
    let execJson: any = null;

    try {
      const { data, error } = await supabase.functions.invoke("run-harness", {
        body: {
          request_id: claimed.id,
          run_label: "worker_execute",
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
      const { data: completed, error: compErr } = await supabase
        .from("harness_run_requests")
        .update({
          status: "COMPLETED",
          executor_finished_at: finishedAt,
          locked_at: null,
          locked_by: null,
          lock_token: null,
          lock_expires_at: null,
          result: execJson,
          error: null,
          run_id: execJson?.run_id ?? null,
        })
        .eq("id", claimed.id)
        .eq("status", "RUNNING")
        .eq("lock_token", lockToken)
        .select("id, status, run_id, executor_started_at, executor_finished_at, attempt_count")
        .maybeSingle();

      if (compErr) return json(500, { ok: false, error: "DB finalize (COMPLETED) failed", detail: compErr.message });
      if (!completed) return json(409, { ok: false, error: "Finalize guard failed (COMPLETED)", claimed });

      return json(200, {
        ok: true,
        mode,
        message: "Executed via run-harness and finalized COMPLETED.",
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
          executor_finished_at: finishedAt,
          locked_at: null,
          locked_by: null,
          lock_token: null,
          lock_expires_at: null,
          result: execJson,
          error: `executor_invoke_failed`,
        })
        .eq("id", claimed.id)
        .eq("status", "RUNNING")
        .eq("lock_token", lockToken)
        .select("id, status, executor_started_at, executor_finished_at, attempt_count")
        .maybeSingle();

      if (failErr) return json(500, { ok: false, error: "DB finalize (FAILED) failed", detail: failErr.message });
      if (!failed) return json(409, { ok: false, error: "Finalize guard failed (FAILED)", claimed });

      return json(200, {
        ok: false,
        mode,
        message: "Execution attempted but run-harness invoke failed; finalized FAILED.",
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
