import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AUTONOMOUS_REPAIR_RULEPACK_VERSION,
  SYSTEM_AUTO_APPROVER_ACTOR_ID,
} from "../_shared/autonomous-repair.ts";

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

type ProposalRow = {
  id: string;
  proposal_status: string;
  decided_at: string | null;
  decided_by: string | null;
  decision_reason: string | null;
  approval_mode: string | null;
  approved_by_actor_type: string | null;
  approved_by_actor_id: string | null;
  autonomy_tier_used: number | null;
  action_type: string | null;
  target_kind: string | null;
  target_id: string | null;
  reason_code: string | null;
  risk_class: string | null;
  autonomy_tier_requested: number | null;
  is_structured_intent: boolean;
  rulepack_version: string | null;
  auto_approval_eligible: boolean | null;
  auto_approval_evaluated_at: string | null;
  auto_approval_rejection_code: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = (
      Deno.env.get("ILLARA_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      ""
    ).trim();

    const SUPABASE_SERVICE_ROLE_KEY = (
      Deno.env.get("ILLARA_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      ""
    ).trim();

    const expectedWorkerToken = Deno.env.get("ILLARA_WORKER_TOKEN") ?? "";
    const suppliedWorkerToken = req.headers.get("x-illara-worker-token") ?? "";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }

    if (SUPABASE_SERVICE_ROLE_KEY.split(".").length !== 3) {
      return json(500, { error: "Invalid service role key format (expected JWT)" });
    }

    if (!expectedWorkerToken) {
      return json(500, { error: "Worker token secret not configured" });
    }

    if (!suppliedWorkerToken || !safeEqual(suppliedWorkerToken, expectedWorkerToken)) {
      return json(401, { error: "Invalid worker token" });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const proposal_id = String(body?.proposal_id ?? "").trim();

    if (!proposal_id) return json(400, { error: "proposal_id is required" });

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: proposal, error: readErr } = await supabaseAdmin
      .from("repair_proposals")
      .select(`
        id,
        proposal_status,
        decided_at,
        decided_by,
        decision_reason,
        approval_mode,
        approved_by_actor_type,
        approved_by_actor_id,
        autonomy_tier_used,
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

    const p = proposal as ProposalRow;

    if (p.proposal_status !== "PROPOSED") {
      return json(409, {
        error: "Proposal must be in PROPOSED state",
        current_status: p.proposal_status,
      });
    }

    if (p.action_type !== "RERUN_HARNESS_VERIFICATION") {
      return json(403, {
        error: "Action type not eligible for autonomous approval in v1",
        action_type: p.action_type,
      });
    }

    if (!p.is_structured_intent) {
      return json(403, { error: "Proposal is not structured" });
    }

    if (p.auto_approval_eligible !== true) {
      return json(403, {
        error: "Proposal is not marked auto-approval eligible",
        auto_approval_eligible: p.auto_approval_eligible,
        rejection_code: p.auto_approval_rejection_code,
      });
    }

    if (p.risk_class !== "LOW") {
      return json(403, {
        error: "Proposal risk class is not LOW",
        risk_class: p.risk_class,
      });
    }

    if (p.autonomy_tier_requested !== 1) {
      return json(403, {
        error: "Proposal autonomy tier is not 1",
        autonomy_tier_requested: p.autonomy_tier_requested,
      });
    }

    if (p.rulepack_version !== AUTONOMOUS_REPAIR_RULEPACK_VERSION) {
      return json(403, {
        error: "Rulepack version mismatch",
        rulepack_version: p.rulepack_version,
      });
    }

    if (p.auto_approval_rejection_code !== null) {
      return json(403, {
        error: "Proposal still carries a rejection code",
        rejection_code: p.auto_approval_rejection_code,
      });
    }

    const decidedAt = new Date().toISOString();
    const systemDecisionReason =
      "Autonomously approved under Tier 1 rulepack after shadow eligibility confirmation.";

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("repair_proposals")
      .update({
        proposal_status: "APPROVED",
        decided_at: decidedAt,
        decided_by: SYSTEM_AUTO_APPROVER_ACTOR_ID,
        decision_reason: systemDecisionReason,
        approval_mode: "AUTO",
        approved_by_actor_type: "SYSTEM",
        approved_by_actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
        autonomy_tier_used: 1,
      })
      .eq("id", proposal_id)
      .eq("proposal_status", "PROPOSED")
      .select(`
        id,
        proposal_status,
        decided_at,
        decided_by,
        decision_reason,
        approval_mode,
        approved_by_actor_type,
        approved_by_actor_id,
        autonomy_tier_used,
        action_type,
        rulepack_version
      `)
      .single();

    if (updErr || !updated) {
      return json(500, {
        error: "Failed to autonomously approve proposal",
        detail: updErr?.message ?? updErr,
      });
    }

    const { error: evtErr } = await supabaseAdmin
      .from("repair_approval_events")
      .insert([
        {
          repair_proposal_id: proposal_id,
          repair_action_run_id: null,
          event_type: "AUTO_APPROVED",
          actor_type: "SYSTEM",
          actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
          action_type: p.action_type,
          target_kind: p.target_kind,
          target_id: p.target_id,
          autonomy_tier: 1,
          rulepack_version: p.rulepack_version,
          eligibility_result: "APPROVED_TIER1",
          rejection_reason_code: null,
          event_payload: {
            approval_mode: "AUTO",
            approved_at: decidedAt,
            decision_reason: systemDecisionReason,
          },
        },
      ]);

    if (evtErr) {
      console.error("[AUTO-APPROVE] repair_approval_events insert failed", evtErr);
    }

    return json(200, {
      ok: true,
      proposal: updated,
    });
  } catch (err) {
    console.error("[AUTO-APPROVE] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});