import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AUTONOMOUS_REPAIR_RULEPACK_VERSION,
  SYSTEM_AUTO_APPROVER_ACTOR_ID,
  buildStructuredRepairIntentCandidate,
  isActiveTier1ActionType,
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
  preconditions_json: unknown;
  verification_plan_json: unknown;
  proposal_evidence_json: unknown;
  rulepack_version: string | null;
  auto_approval_eligible: boolean | null;
  auto_approval_evaluated_at: string | null;
  auto_approval_rejection_code: string | null;
};

const AUTO_APPROVAL_COOLDOWN_MINUTES = 10;
const AUTO_APPROVAL_BUDGET_WINDOW_HOURS = 24;
const AUTO_APPROVAL_BUDGET_MAX_PER_TARGET = 3;

async function appendAutoApprovalRecheckFailedEvent(
  supabaseAdmin: ReturnType<typeof createClient>,
  proposal: ProposalRow,
  params: {
    rejection_reason_code: string;
    event_payload: Record<string, unknown>;
  },
) {
  const { rejection_reason_code, event_payload } = params;

  const { error: evtErr } = await supabaseAdmin
    .from("repair_approval_events")
    .insert([
      {
        repair_proposal_id: proposal.id,
        repair_action_run_id: null,
        event_type: "AUTO_APPROVAL_RECHECK_FAILED",
        actor_type: "SYSTEM",
        actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
        action_type: proposal.action_type,
        target_kind: proposal.target_kind,
        target_id: proposal.target_id,
        autonomy_tier: proposal.autonomy_tier_requested,
        rulepack_version: proposal.rulepack_version,
        eligibility_result: "RECHECK_FAILED",
        rejection_reason_code,
        event_payload,
      },
    ]);

  if (evtErr) {
    console.error("[AUTO-APPROVE] AUTO_APPROVAL_RECHECK_FAILED insert failed", {
      proposal_id: proposal.id,
      rejection_reason_code,
      evtErr,
      event_payload,
    });
  }
}

async function failRecheck(
  supabaseAdmin: ReturnType<typeof createClient>,
  proposal: ProposalRow,
  status: number,
  errorMessage: string,
  rejectionReasonCode: string,
  extraBody: Record<string, unknown> = {},
  extraPayload: Record<string, unknown> = {},
) {
  await appendAutoApprovalRecheckFailedEvent(supabaseAdmin, proposal, {
    rejection_reason_code: rejectionReasonCode,
    event_payload: {
      error: errorMessage,
      proposal_status: proposal.proposal_status,
      action_type: proposal.action_type,
      target_kind: proposal.target_kind,
      target_id: proposal.target_id,
      risk_class: proposal.risk_class,
      autonomy_tier_requested: proposal.autonomy_tier_requested,
      rulepack_version: proposal.rulepack_version,
      auto_approval_eligible: proposal.auto_approval_eligible,
      auto_approval_evaluated_at: proposal.auto_approval_evaluated_at,
      auto_approval_rejection_code: proposal.auto_approval_rejection_code,
      approval_time_recheck: true,
      ...extraPayload,
    },
  });

  return json(status, {
    error: errorMessage,
    ...extraBody,
  });
}

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
        preconditions_json,
        verification_plan_json,
        proposal_evidence_json,
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
      return await failRecheck(
        supabaseAdmin,
        p,
        409,
        "Proposal must be in PROPOSED state",
        "PROPOSAL_NOT_PROPOSED",
        {
          current_status: p.proposal_status,
        },
        {
          current_status: p.proposal_status,
        },
      );
    }

    if (!p.is_structured_intent) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal is not structured",
        "PROPOSAL_NOT_STRUCTURED",
      );
    }

    if (!isActiveTier1ActionType(p.action_type)) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Action type not active for autonomous approval",
        "ACTION_TYPE_NOT_ACTIVE",
        {
          action_type: p.action_type,
        },
        {
          observed_action_type: p.action_type,
        },
      );
    }

    if (p.action_type !== "RERUN_HARNESS_VERIFICATION") {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Action type not eligible for autonomous approval in v1",
        "ACTION_TYPE_NOT_ELIGIBLE_V1",
        {
          action_type: p.action_type,
        },
        {
          observed_action_type: p.action_type,
        },
      );
    }

    if (p.auto_approval_eligible !== true) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal is not marked auto-approval eligible",
        "AUTO_APPROVAL_NOT_ELIGIBLE",
        {
          auto_approval_eligible: p.auto_approval_eligible,
          rejection_code: p.auto_approval_rejection_code,
        },
        {
          observed_auto_approval_eligible: p.auto_approval_eligible,
          observed_rejection_code: p.auto_approval_rejection_code,
        },
      );
    }

    if (p.risk_class !== "LOW") {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal risk class is not LOW",
        "RISK_CLASS_NOT_LOW",
        {
          risk_class: p.risk_class,
        },
        {
          observed_risk_class: p.risk_class,
        },
      );
    }

    if (p.autonomy_tier_requested !== 1) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal autonomy tier is not 1",
        "AUTONOMY_TIER_NOT_1",
        {
          autonomy_tier_requested: p.autonomy_tier_requested,
        },
        {
          observed_autonomy_tier_requested: p.autonomy_tier_requested,
        },
      );
    }

    if (p.rulepack_version !== AUTONOMOUS_REPAIR_RULEPACK_VERSION) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Rulepack version mismatch",
        "RULEPACK_VERSION_MISMATCH",
        {
          rulepack_version: p.rulepack_version,
        },
        {
          expected_rulepack_version: AUTONOMOUS_REPAIR_RULEPACK_VERSION,
          observed_rulepack_version: p.rulepack_version,
        },
      );
    }

    if (p.auto_approval_rejection_code !== null) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal still carries a rejection code",
        "REJECTION_CODE_PRESENT",
        {
          rejection_code: p.auto_approval_rejection_code,
        },
        {
          observed_rejection_code: p.auto_approval_rejection_code,
        },
      );
    }

    const structuredCandidate = buildStructuredRepairIntentCandidate({
      action_type: p.action_type,
      target_kind: p.target_kind,
      target_id: p.target_id,
      reason_code: p.reason_code,
      risk_class: p.risk_class,
      autonomy_tier_requested: p.autonomy_tier_requested,
      preconditions_json: p.preconditions_json,
      verification_plan_json: p.verification_plan_json,
      proposal_evidence_json: p.proposal_evidence_json,
    });

    if (!structuredCandidate) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Proposal no longer satisfies structured Tier 1 contract at approval time",
        "STRUCTURED_CONTRACT_INVALID_AT_RECHECK",
      );
    }

    if (structuredCandidate.verification_plan.type !== "RERUN_HARNESS_VERIFICATION") {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Verification plan type is not eligible for v1 autonomous approval",
        "VERIFICATION_PLAN_TYPE_INELIGIBLE",
        {
          verification_plan_type: structuredCandidate.verification_plan.type,
        },
        {
          observed_verification_plan_type: structuredCandidate.verification_plan.type,
        },
      );
    }

    const preconditions = structuredCandidate.preconditions;
    if (
      !("verification_due" in preconditions) ||
      !("no_active_verification_run" in preconditions) ||
      !("verification_budget_remaining" in preconditions)
    ) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Structured preconditions do not satisfy approval-time requirements",
        "REQUIRED_PRECONDITIONS_MISSING",
        {},
        {
          required_precondition_keys: [
            "verification_due",
            "no_active_verification_run",
            "verification_budget_remaining",
          ],
          observed_preconditions: preconditions,
        },
      );
    }

        const targetId = p.target_id;
    if (!targetId) {
      return await failRecheck(
        supabaseAdmin,
        p,
        403,
        "Target id missing at approval time",
        "TARGET_ID_INVALID",
      );
    }

    const cooldownCutoff = new Date(
      Date.now() - AUTO_APPROVAL_COOLDOWN_MINUTES * 60 * 1000,
    ).toISOString();

    const { data: cooldownRows, error: cooldownErr } = await supabaseAdmin
      .from("repair_approval_events")
      .select("id, created_at")
      .eq("event_type", "AUTO_APPROVED")
      .eq("action_type", p.action_type)
      .eq("target_kind", p.target_kind)
      .eq("target_id", targetId)
      .gte("created_at", cooldownCutoff)
      .order("created_at", { ascending: false })
      .limit(1);

    if (cooldownErr) {
      return json(500, {
        error: "Failed to evaluate autonomous approval cooldown",
        detail: cooldownErr.message,
      });
    }

    if ((cooldownRows ?? []).length > 0) {
      const { error: evtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: null,
            event_type: "AUTO_APPROVAL_RATE_LIMITED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: p.target_id,
            autonomy_tier: p.autonomy_tier_requested,
            rulepack_version: p.rulepack_version,
            eligibility_result: "RATE_LIMITED",
            rejection_reason_code: "AUTO_APPROVAL_COOLDOWN_ACTIVE",
            event_payload: {
              error: "Autonomous approval cooldown active",
              approval_time_recheck: true,
              rate_limit_type: "cooldown",
              cooldown_minutes: AUTO_APPROVAL_COOLDOWN_MINUTES,
              latest_auto_approved_at: cooldownRows?.[0]?.created_at ?? null,
              proposal_status: p.proposal_status,
              action_type: p.action_type,
              target_kind: p.target_kind,
              target_id: p.target_id,
              risk_class: p.risk_class,
              autonomy_tier_requested: p.autonomy_tier_requested,
              rulepack_version: p.rulepack_version,
            },
          },
        ]);

      if (evtErr) {
        console.error("[AUTO-APPROVE] AUTO_APPROVAL_RATE_LIMITED insert failed", {
          proposal_id: p.id,
          rejection_reason_code: "AUTO_APPROVAL_COOLDOWN_ACTIVE",
          evtErr,
        });
      }

      return json(403, {
        error: "Autonomous approval cooldown active",
        cooldown_minutes: AUTO_APPROVAL_COOLDOWN_MINUTES,
      });
    }

    const budgetCutoff = new Date(
      Date.now() - AUTO_APPROVAL_BUDGET_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: budgetRows, error: budgetErr } = await supabaseAdmin
      .from("repair_approval_events")
      .select("id, created_at")
      .eq("event_type", "AUTO_APPROVED")
      .eq("action_type", p.action_type)
      .eq("target_kind", p.target_kind)
      .eq("target_id", targetId)
      .gte("created_at", budgetCutoff);

    if (budgetErr) {
      return json(500, {
        error: "Failed to evaluate autonomous approval budget",
        detail: budgetErr.message,
      });
    }

    const approvalCountInWindow = (budgetRows ?? []).length;

    if (approvalCountInWindow >= AUTO_APPROVAL_BUDGET_MAX_PER_TARGET) {
      const { error: evtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: null,
            event_type: "AUTO_APPROVAL_RATE_LIMITED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: p.target_id,
            autonomy_tier: p.autonomy_tier_requested,
            rulepack_version: p.rulepack_version,
            eligibility_result: "RATE_LIMITED",
            rejection_reason_code: "AUTO_APPROVAL_BUDGET_EXCEEDED",
            event_payload: {
              error: "Autonomous approval budget exceeded",
              approval_time_recheck: true,
              rate_limit_type: "budget",
              budget_window_hours: AUTO_APPROVAL_BUDGET_WINDOW_HOURS,
              budget_max_per_target: AUTO_APPROVAL_BUDGET_MAX_PER_TARGET,
              approvals_in_window: approvalCountInWindow,
              proposal_status: p.proposal_status,
              action_type: p.action_type,
              target_kind: p.target_kind,
              target_id: p.target_id,
              risk_class: p.risk_class,
              autonomy_tier_requested: p.autonomy_tier_requested,
              rulepack_version: p.rulepack_version,
            },
          },
        ]);

      if (evtErr) {
        console.error("[AUTO-APPROVE] AUTO_APPROVAL_RATE_LIMITED insert failed", {
          proposal_id: p.id,
          rejection_reason_code: "AUTO_APPROVAL_BUDGET_EXCEEDED",
          evtErr,
        });
      }

      return json(403, {
        error: "Autonomous approval budget exceeded",
        budget_window_hours: AUTO_APPROVAL_BUDGET_WINDOW_HOURS,
        budget_max_per_target: AUTO_APPROVAL_BUDGET_MAX_PER_TARGET,
        approvals_in_window: approvalCountInWindow,
      });
    }

    const decidedAt = new Date().toISOString();
    const systemDecisionReason =
      "Autonomously approved under Tier 1 rulepack after shadow eligibility confirmation and approval-time invariant recheck.";

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
            approval_time_recheck: true,
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