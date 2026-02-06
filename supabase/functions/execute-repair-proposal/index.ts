import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-worker-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
    const ENV_SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY");
    const ENV_ANON_KEY = Deno.env.get("ILLARA_ANON_KEY");

    if (!SUPABASE_URL || !ENV_SERVICE_ROLE_KEY || !ENV_ANON_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }
    if (ENV_SERVICE_ROLE_KEY.split(".").length !== 3) {
      return json(500, { error: "Invalid service role key format (expected JWT)" });
    }

    const expectedWorkerToken =
      Deno.env.get("ILLARA_WORKER_TOKEN") ?? Deno.env.get("WORKER_TOKEN");
    const suppliedWorkerToken = req.headers.get("x-illara-worker-token") ?? "";

    if (!expectedWorkerToken) return json(500, { error: "Worker token secret not configured" });
    if (!suppliedWorkerToken || !safeEqual(suppliedWorkerToken, expectedWorkerToken)) {
      return json(401, { error: "Invalid worker token" });
    }

    const body = await req.json().catch(() => ({} as any));
    const proposal_id = String(body?.proposal_id ?? "");
    const mode = String(body?.mode ?? "NOOP").toUpperCase();
    const actor_id = String(body?.actor_id ?? "worker");

    if (!proposal_id) return json(400, { error: "proposal_id is required" });
    if (mode !== "NOOP") {
      return json(400, { error: "Only NOOP mode is allowed in Phase C-3A" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, ENV_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${ENV_SERVICE_ROLE_KEY}` } },
      auth: { persistSession: false },
    });

    // Load proposal
    const { data: proposal, error: readErr } = await supabaseAdmin
      .from("repair_proposals")
      .select("id, run_id, proposal_status, failure_severity, evidence")
      .eq("id", proposal_id)
      .single();

    if (readErr || !proposal) {
      return json(404, { error: "Proposal not found", detail: readErr?.message ?? readErr });
    }

    if (proposal.proposal_status !== "APPROVED") {
      return json(409, {
        error: "Proposal must be APPROVED to execute",
        current_status: proposal.proposal_status,
      });
    }

    const now = new Date().toISOString();

    // Try create action run (unique index enforces idempotency per proposal_id)
    const { data: actionRun, error: arErr } = await supabaseAdmin
      .from("repair_action_runs")
      .insert({
        proposal_id: proposal.id,
        run_id: proposal.run_id,
        action_type: "EXECUTE_PROPOSAL_NOOP",
        requested_by: "execute-repair-proposal",
        requested_at: now,
        metadata: {
          mode,
          notes: "Phase C-3A NOOP execution. No mutations performed.",
          failure_severity: proposal.failure_severity,
        },
      })
      .select("id, proposal_id, run_id, action_type, requested_at")
      .single();

    let finalActionRun = actionRun;

    // If unique constraint hit, fetch existing run for this proposal
    if (arErr) {
      const code = String((arErr as any)?.code ?? "");
      const msg = String((arErr as any)?.message ?? "");
      const isDup = code === "23505" || msg.includes("uniq_action_run_per_proposal");

      if (!isDup) {
        return json(500, {
          error: "Failed to create action run",
          detail: (arErr as any)?.message ?? arErr,
        });
      }

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("repair_action_runs")
        .select("id, proposal_id, run_id, action_type, requested_at")
        .eq("proposal_id", proposal.id)
        .single();

      if (exErr || !existing) {
        return json(500, { error: "Failed to resolve existing action run", detail: exErr?.message ?? exErr });
      }
      finalActionRun = existing;
    }

    // Write execution events (append-only)
    const target_system =
      (proposal as any)?.evidence?.run?.target_system ?? "governance_dashboard";

    const { error: evt1 } = await supabaseAdmin.from("repair_execution_events").insert({
      action_run_id: finalActionRun!.id,
      event_type: "EXECUTION_STARTED",
      actor_type: "WORKER",
      actor_id,
      details: { mode },
    });
    if (evt1) console.error("[C3] event insert failed", evt1);

    const { error: evt2 } = await supabaseAdmin.from("repair_execution_events").insert({
      action_run_id: finalActionRun!.id,
      event_type: "EXECUTION_COMPLETED",
      actor_type: "WORKER",
      actor_id,
      details: { mode, result: "NOOP_OK" },
    });
    if (evt2) console.error("[C3] event insert failed", evt2);

    const { error: evt3 } = // --- C-3B: Verification wiring (auto re-run harness) ---

await supabaseAdmin.from("repair_execution_events").insert({
  action_run_id: finalActionRun!.id,
  event_type: "VERIFICATION_STARTED",
  actor_type: "SYSTEM",
  actor_id: "execute-repair-proposal",
  details: {
    note: "Re-running harness for post-repair verification",
  },
});

// Call run-harness directly
// Call run-harness directly (verification)
const verifyUrl = `${SUPABASE_URL}/functions/v1/run-harness`;

const verifyRes = await fetch(verifyUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${ENV_ANON_KEY}`, // gateway auth
  },
  body: JSON.stringify({
    // IMPORTANT: must satisfy test_runs_phase_chk
    phase: "harness",
    target_system:
      (proposal as any)?.evidence?.run?.target_system ?? "governance_dashboard",
    source: "repair-verification",
  }),
});

const verifyText = await verifyRes.text();
let verificationPayload: any;

try {
  verificationPayload = JSON.parse(verifyText);
} catch {
  verificationPayload = { error: "Non-JSON response from run-harness", raw: verifyText };
}

let verificationEvent = "VERIFIED_FAIL";
if (verifyRes.ok && verificationPayload?.overall_status === "PASS") {
  verificationEvent = "VERIFIED_PASS";
}

await supabaseAdmin.from("repair_execution_events").insert({
  action_run_id: finalActionRun!.id,
  event_type: verificationEvent,
  actor_type: "SYSTEM",
  actor_id: "execute-repair-proposal",
  details: {
    verify_url: verifyUrl,
    http_status: verifyRes.status,
    ok: verifyRes.ok,
    verification_run_id: verificationPayload?.run_id ?? null,
    overall_status: verificationPayload?.overall_status ?? "UNKNOWN",
    failure_severity: verificationPayload?.failure_severity ?? null,
    error: verificationPayload?.error ?? null,
  },
});
  
    return json(200, {
      ok: true,
      proposal_id: proposal.id,
      action_run_id: finalActionRun!.id,
      mode,
      status: "EXECUTED_NOOP",
      verification:
        verificationEvent === "VERIFIED_PASS" ? "PASS" : "FAIL",
    });
  } catch (err) {
    console.error("[C3] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});
