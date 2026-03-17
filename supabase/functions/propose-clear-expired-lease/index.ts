import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildStructuredRepairIntentRow,
  AUTONOMOUS_REPAIR_RULEPACK_VERSION,
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

type StaleRepairActionRunCandidate = {
  id: string;
  run_id: string;
  requested_at: string;
  approval_status: string;
  execution_status: string;
  verification_status: string;
  escalated_to_human: boolean | null;
  metadata: Record<string, unknown> | null;
  rulepack_version: string | null;
  autonomy_tier_used: number | null;
};

async function findOldestStaleRepairActionRunCandidate(supabaseAdmin: any) {
  const staleCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("repair_action_runs")
    .select(`
      id,
      run_id,
      requested_at,
      approval_status,
      execution_status,
      verification_status,
      escalated_to_human,
      metadata,
      rulepack_version,
      autonomy_tier_used
    `)
    .eq("approval_status", "APPROVED")
    .eq("execution_status", "NOT_STARTED")
    .eq("verification_status", "NOT_VERIFIED")
    .or("escalated_to_human.is.null,escalated_to_human.eq.false")
    .lt("requested_at", staleCutoff)
    .is("executed_at", null)
    .is("verified_at", null)
    .is("verification_completed_at", null)
    .order("requested_at", { ascending: true })
    .limit(20);

  if (error) {
    throw new Error(`Failed to load stale repair_action_runs candidates: ${error.message}`);
  }

  const rows = (data ?? []) as StaleRepairActionRunCandidate[];

  const filtered = rows.find((row) => {
    const metadata = row.metadata ?? {};
    const staleClear = metadata["stale_clear"] === true;
    const terminalReason = metadata["terminal_reason"];
    return !staleClear && terminalReason !== "LEASE_EXPIRED_CLEAR";
  });

  return filtered ?? null;
}

async function findExistingActiveProposalForTarget(
  supabaseAdmin: any,
  targetId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("repair_proposals")
    .select(`
      id,
      proposal_status,
      action_type,
      target_kind,
      target_id,
      created_at
    `)
    .eq("action_type", "CLEAR_EXPIRED_LEASE")
    .eq("target_kind", "repair_action_run")
    .eq("target_id", targetId)
    .in("proposal_status", ["PROPOSED", "APPROVED"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check for existing proposal: ${error.message}`);
  }

  return data ?? null;
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const candidate = await findOldestStaleRepairActionRunCandidate(supabaseAdmin);

    if (!candidate) {
      return json(200, {
        ok: true,
        created: false,
        reason: "NO_STALE_CANDIDATE",
      });
    }

    const existing = await findExistingActiveProposalForTarget(supabaseAdmin, candidate.id);

    if (existing) {
      return json(200, {
        ok: true,
        created: false,
        reason: "ACTIVE_PROPOSAL_ALREADY_EXISTS",
        proposal_id: existing.id,
        target_id: candidate.id,
      });
    }

    const observedAt = new Date().toISOString();

    const structuredIntentRow = buildStructuredRepairIntentRow({
      action_type: "CLEAR_EXPIRED_LEASE",
      target_kind: "repair_action_run",
      target_id: candidate.id,
      reason_code: "STALE_EXECUTION_LEASE",
      risk_class: "LOW",
      autonomy_tier_requested: 1,
      preconditions: {
        approval_status_is_approved: true,
        execution_status_is_not_started: true,
        verification_status_is_not_verified: true,
        not_escalated_to_human: true,
        no_execution_timestamp: true,
        no_verified_timestamp: true,
        no_verification_completed_timestamp: true,
        stale_window_exceeded: true,
        stale_clear_markers_absent: true,
      },
      verification_plan: {
        type: "STATE_CONFIRMATION_CHECK",
        success_condition:
          "Target repair_action_run remains stale-eligible at approval-time recheck and no progress markers have appeared.",
        failure_condition:
          "Target repair_action_run no longer satisfies stale-eligible conditions at approval-time recheck.",
        timeout_seconds: 30,
      },
      proposal_evidence: {
        observed_at: observedAt,
        repair_action_run_id: candidate.id,
        requested_at: candidate.requested_at,
        stale_window_hours: 48,
      },
    });

    const insertRow = {
      run_id: candidate.run_id,
      overall_status: "FAIL",
      failure_severity: "low",
      proposed_by: "propose-clear-expired-lease",
      title: "Clear expired lease for stale repair action run",
      summary:
        `Propose stale-clear for repair_action_runs row ${candidate.id} after a 48-hour stale window with no execution or verification progress.`,
      evidence: {
        stale_candidate: true,
        repair_action_run_id: candidate.id,
        requested_at: candidate.requested_at,
        observed_at: observedAt,
        stale_window_hours: 48,
      },
      risk_assessment: {
        risk_level: "low",
        blast_radius: "single_action_run",
        mitigations: [
          "No mutation in proposal generation",
          "Approval-time recheck required",
          "Autonomous approval remains bounded to Tier 1",
        ],
      },
      proposed_changes: [
        {
          change_type: "STATE_TRANSITION",
          target: `repair_action_runs:${candidate.id}`,
          intent: "Mark stale repair action run for governed stale-clear handling",
          notes: "Proposal generation only. No mutation performed.",
        },
      ],
      guardrails: {
        requires_human_approval: false,
        autonomous_approval_eligible_path: true,
        verification_required: ["STATE_CONFIRMATION_CHECK"],
        notes: "Phase 3 bounded proposal generation only. No execution or row mutation performed here.",
      },
      approval_required: true,
      ...structuredIntentRow,
      rulepack_version: AUTONOMOUS_REPAIR_RULEPACK_VERSION,
    };

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("repair_proposals")
      .insert([insertRow] as any)
      .select(`
        id,
        proposal_status,
        action_type,
        target_kind,
        target_id,
        reason_code,
        risk_class,
        autonomy_tier_requested,
        is_structured_intent,
        rulepack_version
      `)
      .single();

    if (insertErr || !inserted) {
      return json(500, {
        error: "Failed to create CLEAR_EXPIRED_LEASE proposal",
        detail: insertErr?.message ?? insertErr,
      });
    }

    const { error: approvalEvtErr } = await supabaseAdmin
      .from("repair_approval_events")
      .insert([
        {
          repair_proposal_id: inserted.id,
          repair_action_run_id: candidate.id,
          event_type: "REPAIR_PROPOSAL_CREATED",
          actor_type: "SYSTEM",
          actor_id: "propose-clear-expired-lease",
          action_type: inserted.action_type,
          target_kind: inserted.target_kind,
          target_id: inserted.target_id,
          autonomy_tier: inserted.autonomy_tier_requested,
          rulepack_version: inserted.rulepack_version,
          eligibility_result: null,
          rejection_reason_code: null,
          event_payload: {
            created_at: observedAt,
            source: "propose-clear-expired-lease",
            stale_window_hours: 48,
            proposal_status: inserted.proposal_status,
            is_structured_intent: inserted.is_structured_intent,
          },
        },
      ] as any);

    if (approvalEvtErr) {
      console.error(
        "[PROPOSE-CLEAR-EXPIRED-LEASE] repair_approval_events insert failed",
        approvalEvtErr,
      );
    }

    return json(200, {
      ok: true,
      created: true,
      proposal: inserted,
      candidate: {
        repair_action_run_id: candidate.id,
        requested_at: candidate.requested_at,
      },
    });
  } catch (err) {
    console.error("[PROPOSE-CLEAR-EXPIRED-LEASE] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});