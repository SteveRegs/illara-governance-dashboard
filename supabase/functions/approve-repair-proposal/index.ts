import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-approver-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time-ish compare to reduce token timing leaks
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY =
      Deno.env.get("ILLARA_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }

    if (SUPABASE_SERVICE_ROLE_KEY.split(".").length !== 3) {
      return json(500, { error: "Invalid service role key format (expected JWT)" });
    }

    const expectedApproverToken = Deno.env.get("ILLARA_APPROVER_TOKEN") ?? "";
    const suppliedApproverToken =
      req.headers.get("x-illara-approver-token") ?? "";

    if (!expectedApproverToken) {
      return json(500, { error: "Approver token secret not configured" });
    }

    if (!suppliedApproverToken || !safeEqual(suppliedApproverToken, expectedApproverToken)) {
      return json(401, { error: "Invalid approver token" });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const proposal_id = String(body?.proposal_id ?? "");
    const decision = String(body?.decision ?? "").toUpperCase(); // APPROVE | REJECT
    const reason = String(body?.reason ?? "");
    const actor_id = String(body?.actor_id ?? "approver");

    if (!proposal_id) return json(400, { error: "proposal_id is required" });
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return json(400, { error: "decision must be APPROVE or REJECT" });
    }
    if (!reason || reason.trim().length < 3) {
      return json(400, { error: "reason is required" });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: proposal, error: readErr } = await supabaseAdmin
      .from("repair_proposals")
      .select(`
        id,
        run_id,
        proposal_status,
        failure_severity,
        action_type,
        target_kind,
        target_id,
        reason_code,
        risk_class,
        autonomy_tier_requested,
        is_structured_intent,
        rulepack_version,
        auto_approval_eligible,
        auto_approval_evaluated_at,
        auto_approval_rejection_code
      `)
      .eq("id", proposal_id)
      .single();

    if (readErr || !proposal) {
      return json(404, { error: "Proposal not found", detail: readErr?.message ?? readErr });
    }

    if (proposal.proposal_status !== "PROPOSED") {
      return json(409, {
        error: "Proposal not in PROPOSED state",
        current_status: proposal.proposal_status,
      });
    }

    const newStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const decidedAt = new Date().toISOString();

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("repair_proposals")
      .update({
        proposal_status: newStatus,
        decided_at: decidedAt,
        decided_by: actor_id,
        decision_reason: reason,
      })
      .eq("id", proposal_id)
      .select(`
        id,
        run_id,
        proposal_status,
        decided_at,
        decided_by,
        decision_reason,
        failure_severity,
        action_type,
        target_kind,
        target_id,
        reason_code,
        risk_class,
        autonomy_tier_requested,
        is_structured_intent,
        rulepack_version,
        auto_approval_eligible,
        auto_approval_evaluated_at,
        auto_approval_rejection_code
      `)
      .single();

    if (updErr || !updated) {
      return json(500, { error: "Failed to update proposal status", detail: updErr?.message ?? updErr });
    }

    const { error: evtErr } = await supabaseAdmin.from("repair_proposal_events").insert([
      {
        proposal_id: proposal_id,
        event_type: newStatus,
        actor_type: "HUMAN",
        actor_id: actor_id,
        reason: reason,
        details: {
          run_id: updated.run_id,
          failure_severity: updated.failure_severity,
          decision: newStatus,
        },
      },
    ]);

    if (evtErr) console.error("[C2] repair_proposal_events insert failed", evtErr);

    const { error: approvalEvtErr } = await supabaseAdmin
      .from("repair_approval_events")
      .insert([
        {
          repair_proposal_id: proposal_id,
          repair_action_run_id: null,
          event_type: decision === "APPROVE" ? "HUMAN_APPROVED" : "HUMAN_REJECTED",
          actor_type: "HUMAN",
          actor_id,
          action_type: updated.action_type ?? null,
          target_kind: updated.target_kind ?? null,
          target_id: updated.target_id ?? null,
          autonomy_tier: null,
          rulepack_version: null,
          eligibility_result: null,
          rejection_reason_code: null,
          event_payload: {
            proposal_status: updated.proposal_status,
            decided_at: updated.decided_at,
            decision_reason: updated.decision_reason,
            reason_code: updated.reason_code ?? null,
            risk_class: updated.risk_class ?? null,
            is_structured_intent: updated.is_structured_intent ?? false,
            autonomy_tier_requested: updated.autonomy_tier_requested ?? null,
            auto_approval_eligible: updated.auto_approval_eligible ?? null,
            auto_approval_evaluated_at: updated.auto_approval_evaluated_at ?? null,
            auto_approval_rejection_code: updated.auto_approval_rejection_code ?? null,
          },
        },
      ]);

    if (approvalEvtErr) {
      console.error("[C2] repair_approval_events insert failed", approvalEvtErr);
    }

    return json(200, { ok: true, proposal: updated });
  } catch (err) {
    console.error("[C2] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});