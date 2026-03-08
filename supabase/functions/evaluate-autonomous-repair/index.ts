import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  AUTONOMOUS_REPAIR_RULEPACK_VERSION,
  SYSTEM_AUTO_APPROVER_ACTOR_ID,
  getInitialAutoApprovalRejectionCode,
  isStructuredRepairIntent,
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

type RepairProposalRow = {
  id: string;
  created_at: string;
  proposal_status: string;
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const SUPABASE_URL = (Deno.env.get("ILLARA_SUPABASE_URL") ||
      Deno.env.get("SUPABASE_URL") ||
      "").trim();

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
    const limitRaw = Number(body?.limit ?? 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabaseAdmin
      .from("repair_proposals")
      .select(`
        id,
        created_at,
        proposal_status,
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
      .eq("proposal_status", "PROPOSED")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (proposal_id) {
      query = supabaseAdmin
        .from("repair_proposals")
        .select(`
          id,
          created_at,
          proposal_status,
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
        .eq("proposal_status", "PROPOSED")
        .limit(1);
    }

    const { data: proposals, error: readErr } = await query;

    if (readErr) {
      return json(500, { error: "Failed to load proposals", detail: readErr.message });
    }

    const rows = (proposals ?? []) as RepairProposalRow[];

    const results: Array<Record<string, unknown>> = [];

    for (const proposal of rows) {
      const startedAt = new Date().toISOString();

      const { error: startEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: proposal.id,
            repair_action_run_id: null,
            event_type: "AUTO_APPROVAL_EVALUATION_STARTED",
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: proposal.action_type,
            target_kind: proposal.target_kind,
            target_id: proposal.target_id,
            autonomy_tier: proposal.autonomy_tier_requested,
            rulepack_version: proposal.rulepack_version,
            eligibility_result: null,
            rejection_reason_code: null,
            event_payload: {
              mode: "SHADOW",
              started_at: startedAt,
            },
          },
        ]);

      if (startEvtErr) {
        console.error("[AUTO-EVAL] failed to insert evaluation-start event", startEvtErr);
      }

      const rejectionCode = getInitialAutoApprovalRejectionCode({
        is_structured_intent: proposal.is_structured_intent,
        action_type: proposal.action_type,
        target_kind: proposal.target_kind,
        target_id: proposal.target_id,
        reason_code: proposal.reason_code,
        risk_class: proposal.risk_class,
        autonomy_tier_requested: proposal.autonomy_tier_requested,
        verification_plan_json: proposal.verification_plan_json,
        preconditions_json: proposal.preconditions_json,
        rulepack_version: proposal.rulepack_version,
      });

      let eligible = rejectionCode === null;

      if (eligible) {
        const candidateIntent = {
          action_type: proposal.action_type,
          target_kind: proposal.target_kind,
          target_id: proposal.target_id,
          reason_code: proposal.reason_code,
          risk_class: proposal.risk_class,
          autonomy_tier_requested: proposal.autonomy_tier_requested,
          preconditions: proposal.preconditions_json,
          verification_plan: proposal.verification_plan_json,
          proposal_evidence: proposal.proposal_evidence_json,
        };

        if (!isStructuredRepairIntent(candidateIntent)) {
          eligible = false;
        }
      }

      const evaluatedAt = new Date().toISOString();
      const finalRejectionCode =
        rejectionCode ?? (eligible ? null : "UNKNOWN_FIELD_OR_SCHEMA");

      const { error: updErr } = await supabaseAdmin
        .from("repair_proposals")
        .update({
          auto_approval_eligible: eligible,
          auto_approval_evaluated_at: evaluatedAt,
          auto_approval_rejection_code: finalRejectionCode,
          rulepack_version:
            proposal.rulepack_version ?? AUTONOMOUS_REPAIR_RULEPACK_VERSION,
        })
        .eq("id", proposal.id);

      if (updErr) {
        console.error("[AUTO-EVAL] failed to update proposal evaluation fields", updErr);
      }

      const eventType = eligible
        ? "AUTO_APPROVAL_ELIGIBLE"
        : "AUTO_APPROVAL_REJECTED";

      const { error: resultEvtErr } = await supabaseAdmin
        .from("repair_approval_events")
        .insert([
          {
            repair_proposal_id: proposal.id,
            repair_action_run_id: null,
            event_type: eventType,
            actor_type: "SYSTEM",
            actor_id: SYSTEM_AUTO_APPROVER_ACTOR_ID,
            action_type: proposal.action_type,
            target_kind: proposal.target_kind,
            target_id: proposal.target_id,
            autonomy_tier: proposal.autonomy_tier_requested,
            rulepack_version:
              proposal.rulepack_version ?? AUTONOMOUS_REPAIR_RULEPACK_VERSION,
            eligibility_result: eligible ? "ELIGIBLE_SHADOW" : "REJECTED_SHADOW",
            rejection_reason_code: finalRejectionCode,
            event_payload: {
              mode: "SHADOW",
              evaluated_at: evaluatedAt,
              is_structured_intent: proposal.is_structured_intent,
              active_rulepack_version:
                proposal.rulepack_version ?? AUTONOMOUS_REPAIR_RULEPACK_VERSION,
            },
          },
        ]);

      if (resultEvtErr) {
        console.error("[AUTO-EVAL] failed to insert evaluation-result event", resultEvtErr);
      }

      results.push({
        proposal_id: proposal.id,
        eligible,
        rejection_code: finalRejectionCode,
        evaluated_at: evaluatedAt,
        shadow_mode: true,
      });
    }

    return json(200, {
      ok: true,
      mode: "SHADOW",
      evaluated_count: results.length,
      results,
    });
  } catch (err) {
    console.error("[AUTO-EVAL] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});