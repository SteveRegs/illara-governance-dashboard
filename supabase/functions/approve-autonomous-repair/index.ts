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
const STALE_LEASE_MAX_AGE_HOURS = 48;
const CLEAR_EXPIRED_LEASE_MODE =
  Deno.env.get("CLEAR_EXPIRED_LEASE_MODE") ?? "NOOP";

const CLEAR_EXPIRED_LEASE_SHOULD_MUTATE =
  CLEAR_EXPIRED_LEASE_MODE === "MUTATE";

async function appendAutoApprovalRecheckFailedEvent(
  supabaseAdmin: any,
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
    ] as any);

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
  supabaseAdmin: any,
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

type ClearExpiredLeaseCandidate = {
  id: string;
  repair_plan_id: string | null;
  proposal_id: string | null;
  run_id: string | null;
  requested_at: string;
  governance_mode: string | null;
  approval_required: boolean | null;
  approval_mode: string | null;
  autonomy_tier_used: number | null;
  rulepack_version: string | null;
  approval_status: string;
  execution_status: string;
  verification_status: string;
  escalated_to_human: boolean | null;
  stale_clear: boolean | null;
  stale_cleared_at: string | null;
  stale_cleared_by: string | null;
  stale_clear_proposal_id: string | null;
  stale_clear_event_id: string | null;
  terminal_reason: string | null;
  terminal_reason_version: string | null;
  metadata: Record<string, unknown> | null;
};

async function findClearExpiredLeaseCandidate(supabaseAdmin: any) {
  const staleCutoff = new Date(
    Date.now() - STALE_LEASE_MAX_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("repair_action_runs")
    .select(`
      id,
      repair_plan_id,
      proposal_id,
      run_id,
      requested_at,
      governance_mode,
      approval_required,
      approval_mode,
      autonomy_tier_used,
      rulepack_version,
      approval_status,
      execution_status,
      verification_status,
      escalated_to_human,
      stale_clear,
      stale_cleared_at,
      stale_cleared_by,
      stale_clear_proposal_id,
      stale_clear_event_id,
      terminal_reason,
      terminal_reason_version,
      metadata
    `)
    .eq("approval_status", "APPROVED")
    .eq("execution_status", "NOT_STARTED")
    .eq("verification_status", "NOT_VERIFIED")
    .or("escalated_to_human.is.null,escalated_to_human.eq.false")
    .lt("requested_at", staleCutoff)
    .eq("stale_clear", false)
    .is("executed_at", null)
    .is("verified_at", null)
    .is("verification_completed_at", null)
    .order("requested_at", { ascending: true })
    .limit(10);

  if (error) {
    throw new Error(`Failed to query stale lease candidates: ${error.message}`);
  }

  const rows = (data ?? []) as ClearExpiredLeaseCandidate[];

  const filtered = rows.find((row) => {
    const staleClear = row.stale_clear === true;
    const terminalReason = row.terminal_reason;
    return !staleClear && terminalReason !== "LEASE_EXPIRED_CLEAR";
  });

  return filtered ?? null;
}

type ClearExpiredLeaseRecheckResult =
  | { ok: true; row: ClearExpiredLeaseCandidate }
  | {
      ok: false;
      rejection_reason_code:
        | "STATE_CHANGED_DURING_EVALUATION"
        | "TARGET_ID_INVALID"
        | "RULEPACK_VERSION_MISMATCH";
      detail: string;
      observed?: Record<string, unknown>;
    };

async function recheckClearExpiredLeaseCandidate(
  supabaseAdmin: any,
  candidateId: string,
): Promise<ClearExpiredLeaseRecheckResult> {
  const staleCutoff = new Date(
    Date.now() - STALE_LEASE_MAX_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("repair_action_runs")
    .select(`
      id,
      repair_plan_id,
      proposal_id,
      run_id,
      requested_at,
      governance_mode,
      approval_required,
      approval_mode,
      autonomy_tier_used,
      rulepack_version,
      approval_status,
      execution_status,
      verification_status,
      escalated_to_human,
      stale_clear,
      stale_cleared_at,
      stale_cleared_by,
      stale_clear_proposal_id,
      stale_clear_event_id,
      terminal_reason,
      terminal_reason_version,
      metadata,
      executed_at,
      verified_at,
      verification_completed_at
    `)
    .eq("id", candidateId)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      rejection_reason_code: "STATE_CHANGED_DURING_EVALUATION",
      detail: `Failed to re-read repair_action_runs row: ${error.message}`,
    };
  }

  if (!data) {
    return {
      ok: false,
      rejection_reason_code: "TARGET_ID_INVALID",
      detail: "Candidate action run no longer exists",
    };
  }

  const staleClear = data.stale_clear === true;
  const terminalReason = data.terminal_reason;

  const stillEligible =
    data.approval_status === "APPROVED" &&
    data.execution_status === "NOT_STARTED" &&
    data.verification_status === "NOT_VERIFIED" &&
    (data.escalated_to_human === false || data.escalated_to_human === null) &&
    !!data.requested_at &&
    data.requested_at < staleCutoff &&
    data.executed_at == null &&
    data.verified_at == null &&
    data.verification_completed_at == null &&
    !staleClear &&
    terminalReason !== "LEASE_EXPIRED_CLEAR";

  if (!stillEligible) {
    return {
      ok: false,
      rejection_reason_code: "STATE_CHANGED_DURING_EVALUATION",
      detail: "Candidate no longer satisfies stale lease approval-time requirements",
      observed: {
        approval_status: data.approval_status,
        execution_status: data.execution_status,
        verification_status: data.verification_status,
        escalated_to_human: data.escalated_to_human,
        requested_at: data.requested_at,
        executed_at: data.executed_at,
        verified_at: data.verified_at,
        verification_completed_at: data.verification_completed_at,
        stale_clear: data.stale_clear,
        stale_cleared_at: data.stale_cleared_at,
        stale_cleared_by: data.stale_cleared_by,
        stale_clear_proposal_id: data.stale_clear_proposal_id,
        stale_clear_event_id: data.stale_clear_event_id,
        terminal_reason: data.terminal_reason,
        terminal_reason_version: data.terminal_reason_version,
        metadata: data.metadata,
      },
    };
  }

  if (
    data.rulepack_version &&
    data.rulepack_version !== AUTONOMOUS_REPAIR_RULEPACK_VERSION
  ) {
    return {
      ok: false,
      rejection_reason_code: "RULEPACK_VERSION_MISMATCH",
      detail: "Candidate rulepack version does not match current autonomous repair rulepack",
      observed: {
        observed_rulepack_version: data.rulepack_version,
        expected_rulepack_version: AUTONOMOUS_REPAIR_RULEPACK_VERSION,
      },
    };
  }

  return {
    ok: true,
    row: data as ClearExpiredLeaseCandidate,
  };
}

type ClearExpiredLeaseMutatedRow = ClearExpiredLeaseCandidate & {
  executed_at: string | null;
  verified_at: string | null;
  verification_completed_at: string | null;
};

async function applyClearExpiredLeaseMutation(
  supabaseAdmin: any,
  targetId: string,
  proposalId: string,
  actorId: string,
  staleClearEventId: string | null,
): Promise<ClearExpiredLeaseMutatedRow | null> {
  const staleCutoff = new Date(
    Date.now() - STALE_LEASE_MAX_AGE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const staleClearedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("repair_action_runs")
    .update({
      approval_status: "SKIPPED",
      execution_status: "SKIPPED",
      verification_status: "UNKNOWN",
      stale_clear: true,
      stale_cleared_at: staleClearedAt,
      stale_cleared_by: actorId,
      stale_clear_proposal_id: proposalId,
      stale_clear_event_id: staleClearEventId,
      terminal_reason: "LEASE_EXPIRED_CLEAR",
      terminal_reason_version: "v1",
    })
    .eq("id", targetId)
    .eq("approval_status", "APPROVED")
    .eq("execution_status", "NOT_STARTED")
    .eq("verification_status", "NOT_VERIFIED")
    .or("escalated_to_human.is.null,escalated_to_human.eq.false")
    .eq("stale_clear", false)
    .lt("requested_at", staleCutoff)
    .is("executed_at", null)
    .is("verified_at", null)
    .is("verification_completed_at", null)
    .select(`
      id,
      repair_plan_id,
      proposal_id,
      run_id,
      requested_at,
      governance_mode,
      approval_required,
      approval_mode,
      autonomy_tier_used,
      rulepack_version,
      approval_status,
      execution_status,
      verification_status,
      escalated_to_human,
      stale_clear,
      stale_cleared_at,
      stale_cleared_by,
      stale_clear_proposal_id,
      stale_clear_event_id,
      terminal_reason,
      terminal_reason_version,
      metadata,
      executed_at,
      verified_at,
      verification_completed_at
    `)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to apply stale-clear mutation: ${error.message}`);
  }

  return (data as ClearExpiredLeaseMutatedRow | null) ?? null;
}

async function verifyClearExpiredLeaseMutation(
  supabaseAdmin: any,
  targetId: string,
  proposalId: string,
): Promise<{ ok: boolean; row: ClearExpiredLeaseMutatedRow | null }> {
  const { data, error } = await supabaseAdmin
    .from("repair_action_runs")
    .select(`
      id,
      repair_plan_id,
      proposal_id,
      run_id,
      requested_at,
      governance_mode,
      approval_required,
      approval_mode,
      autonomy_tier_used,
      rulepack_version,
      approval_status,
      execution_status,
      verification_status,
      escalated_to_human,
      stale_clear,
      stale_cleared_at,
      stale_cleared_by,
      stale_clear_proposal_id,
      stale_clear_event_id,
      terminal_reason,
      terminal_reason_version,
      metadata,
      executed_at,
      verified_at,
      verification_completed_at
    `)
    .eq("id", targetId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, row: null };
  }

  const row = data as ClearExpiredLeaseMutatedRow;
  const ok =
    row.approval_status === "SKIPPED" &&
    row.execution_status === "SKIPPED" &&
    row.verification_status === "UNKNOWN" &&
    row.stale_clear === true &&
    row.stale_clear_proposal_id === proposalId &&
    row.terminal_reason === "LEASE_EXPIRED_CLEAR" &&
    row.terminal_reason_version === "v1" &&
    row.executed_at == null &&
    row.verified_at == null &&
    row.verification_completed_at == null;

  return { ok, row };
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

    if (
      p.action_type !== "RERUN_HARNESS_VERIFICATION" &&
      p.action_type !== "CLEAR_EXPIRED_LEASE"
    ) {
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

    if (p.action_type === "RERUN_HARNESS_VERIFICATION") {
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
    }

    if (p.action_type === "CLEAR_EXPIRED_LEASE") {
      const staleCandidate = await findClearExpiredLeaseCandidate(supabaseAdmin);

      if (!staleCandidate) {
        return await failRecheck(
          supabaseAdmin,
          p,
          403,
          "No stale lease candidate currently satisfies detection requirements",
          "STATE_CHANGED_DURING_EVALUATION",
          {
            action_type: p.action_type,
          },
          {
            stale_window_hours: STALE_LEASE_MAX_AGE_HOURS,
          },
        );
      }

      if (staleCandidate.id !== p.target_id) {
        return await failRecheck(
          supabaseAdmin,
          p,
          403,
          "Proposal target is not the current oldest eligible stale lease candidate",
          "STATE_CHANGED_DURING_EVALUATION",
          {
            expected_target_id: staleCandidate.id,
          },
          {
            observed_target_id: p.target_id,
            detected_candidate_id: staleCandidate.id,
          },
        );
      }

      const { error: detectedEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: staleCandidate.id,
            event_type: "STALE_LEASE_CANDIDATE_IDENTIFIED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: staleCandidate.id,
            autonomy_tier: p.autonomy_tier_requested,
            rulepack_version: p.rulepack_version,
            eligibility_result: "CANDIDATE_IDENTIFIED",
            rejection_reason_code: null,
            event_payload: {
              requested_at: staleCandidate.requested_at,
              stale_window_hours: STALE_LEASE_MAX_AGE_HOURS,
              approval_time_recheck: false,
            },
          },
        ] as any);

      if (detectedEvtErr) {
        console.error("[AUTO-APPROVE] STALE_LEASE_CANDIDATE_IDENTIFIED insert failed", detectedEvtErr);
      }

      const recheck = await recheckClearExpiredLeaseCandidate(supabaseAdmin, staleCandidate.id);

      if (!recheck.ok) {
        const { error: evtErr } = await supabaseAdmin
          .from("repair_approval_events")
          .insert([
            {
              repair_proposal_id: p.id,
              repair_action_run_id: staleCandidate.id,
              event_type: "STALE_LEASE_CLEAR_RECHECK_FAILED",
              actor_type: "SYSTEM",
              actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
              action_type: p.action_type,
              target_kind: p.target_kind,
              target_id: staleCandidate.id,
              autonomy_tier: p.autonomy_tier_requested,
              rulepack_version: p.rulepack_version,
              eligibility_result: "RECHECK_FAILED",
              rejection_reason_code: recheck.rejection_reason_code,
              event_payload: {
                error: recheck.detail,
                approval_time_recheck: true,
                ...("observed" in recheck ? { observed: recheck.observed ?? null } : {}),
              },
            },
          ] as any);

        if (evtErr) {
          console.error("[AUTO-APPROVE] STALE_LEASE_CLEAR_RECHECK_FAILED insert failed", evtErr);
        }

        return json(403, {
          error: recheck.detail,
          rejection_reason_code: recheck.rejection_reason_code,
        });
      }

      if (!CLEAR_EXPIRED_LEASE_SHOULD_MUTATE) {
        return json(200, {
          ok: true,
          noop: true,
          action_type: "CLEAR_EXPIRED_LEASE",
          message: "Slice 1 detection and Slice 2 approval-time recheck passed. No mutation performed in this stage.",
          candidate: {
            repair_action_run_id: recheck.row.id,
            requested_at: recheck.row.requested_at,
          },
        });
      }

      const decidedAt = new Date().toISOString();
      const mutateDecisionReason =
        "Autonomously approved and terminally stale-cleared under Tier 1 rulepack after approval-time invariant recheck.";

      const { data: approvedEvent, error: approvedEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: recheck.row.id,
            event_type: "STALE_LEASE_CLEAR_APPROVED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: recheck.row.id,
            autonomy_tier: p.autonomy_tier_requested,
            rulepack_version: p.rulepack_version,
            eligibility_result: "APPROVED_TIER1",
            rejection_reason_code: null,
            event_payload: {
              approval_mode: "AUTO",
              approved_at: decidedAt,
              decision_reason: mutateDecisionReason,
              approval_time_recheck: true,
              mode: "MUTATE",
            },
          },
        ])
        .select("id")
        .maybeSingle();

      const staleClearApprovedEventId = approvedEvent?.id ?? null;

      if (approvedEvtErr || !staleClearApprovedEventId) {
        return json(500, {
          error: "Failed to record stale lease approval event",
          detail: approvedEvtErr?.message ?? "STALE_LEASE_CLEAR_APPROVED insert returned no id",
        });
      }

      const mutatedRow = await applyClearExpiredLeaseMutation(
        supabaseAdmin,
        recheck.row.id,
        p.id,
        SYSTEM_AUTO_APPROVER_ACTOR_ID,
        staleClearApprovedEventId,
      );

      if (!mutatedRow) {
        const { error: evtErr } = await supabaseAdmin
          .from("repair_approval_events")
          .insert([
            {
              repair_proposal_id: p.id,
              repair_action_run_id: recheck.row.id,
              event_type: "STALE_LEASE_CLEAR_RECHECK_FAILED",
              actor_type: "SYSTEM",
              actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
              action_type: p.action_type,
              target_kind: p.target_kind,
              target_id: recheck.row.id,
              autonomy_tier: p.autonomy_tier_requested,
              rulepack_version: p.rulepack_version,
              eligibility_result: "RECHECK_FAILED",
              rejection_reason_code: "STATE_CHANGED_DURING_EVALUATION",
              event_payload: {
                error: "Guarded stale-clear mutation updated zero rows",
                approval_time_recheck: true,
                mode: "MUTATE",
              },
            },
          ] as any);

        if (evtErr) {
          console.error("[AUTO-APPROVE] STALE_LEASE_CLEAR_RECHECK_FAILED insert failed", evtErr);
        }

        return json(409, {
          error: "Candidate no longer satisfies stale lease mutation guard",
          rejection_reason_code: "STATE_CHANGED_DURING_EVALUATION",
        });
      }

      const { error: executedEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: recheck.row.id,
            event_type: "STALE_LEASE_CLEAR_EXECUTED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: recheck.row.id,
            autonomy_tier: p.autonomy_tier_requested,
            rulepack_version: p.rulepack_version,
            eligibility_result: "EXECUTED",
            rejection_reason_code: null,
            event_payload: {
              approval_time_recheck: true,
              mode: "MUTATE",
              stale_clear_event_id: staleClearApprovedEventId,
            },
          },
        ] as any);

      if (executedEvtErr) {
        console.error("[AUTO-APPROVE] STALE_LEASE_CLEAR_EXECUTED insert failed", executedEvtErr);
      }

      const verification = await verifyClearExpiredLeaseMutation(
        supabaseAdmin,
        recheck.row.id,
        p.id,
      );

      if (!verification.ok) {
        return json(500, {
          error: "Stale-clear mutation verification failed",
          verified: false,
          observed: verification.row,
        });
      }

      const { data: updatedProposal, error: updErr } = await supabaseAdmin
        .from("repair_proposals")
        .update({
          proposal_status: "APPROVED",
          decided_at: decidedAt,
          decided_by: SYSTEM_AUTO_APPROVER_ACTOR_ID,
          decision_reason: mutateDecisionReason,
          approval_mode: "AUTO",
          approved_by_actor_type: "SYSTEM",
          approved_by_actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
          autonomy_tier_used: 1,
        })
        .eq("id", p.id)
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

      if (updErr || !updatedProposal) {
        return json(500, {
          error: "Failed to persist stale-clear autonomous approval provenance",
          detail: updErr?.message ?? updErr,
        });
      }

      const { error: verifiedEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: p.id,
            repair_action_run_id: recheck.row.id,
            event_type: "STALE_LEASE_CLEAR_VERIFIED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: p.action_type,
            target_kind: p.target_kind,
            target_id: recheck.row.id,
            autonomy_tier: 1,
            rulepack_version: p.rulepack_version,
            eligibility_result: "VERIFIED",
            rejection_reason_code: null,
            event_payload: {
              approval_time_recheck: true,
              mode: "MUTATE",
              verified: true,
            },
          },
        ] as any);

      if (verifiedEvtErr) {
        console.error("[AUTO-APPROVE] STALE_LEASE_CLEAR_VERIFIED insert failed", verifiedEvtErr);
      }

      return json(200, {
        ok: true,
        approved: true,
        autonomous: true,
        noop: false,
        mode: "MUTATE",
        mutated: true,
        verified: true,
        proposal: updatedProposal,
        action_run: verification.row,
        approval_time_recheck: true,
      });
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
