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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }

    const expectedWorkerToken = Deno.env.get("ILLARA_WORKER_TOKEN") ?? "";
    const suppliedWorkerToken = req.headers.get("x-illara-worker-token") ?? "";

    if (!expectedWorkerToken) {
      return json(500, { error: "Worker token secret not configured" });
    }
    if (!suppliedWorkerToken || !safeEqual(suppliedWorkerToken, expectedWorkerToken)) {
      return json(401, { error: "Invalid worker token" });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const proposal_id = String(body?.proposal_id ?? "");
    const mode = String(body?.mode ?? "NOOP").toUpperCase();
    const actor_id = String(body?.actor_id ?? "worker");

    if (!proposal_id) return json(400, { error: "proposal_id is required" });
    if (mode !== "NOOP") {
      return json(400, { error: "Only NOOP mode is allowed in Phase C-3A" });
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
        evidence,
        decided_by,
        decided_at,
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

    if (proposal.proposal_status !== "APPROVED") {
      return json(409, {
        error: "Proposal must be APPROVED to execute",
        current_status: proposal.proposal_status,
      });
    }

    const resolvedApprovalMode = proposal.approval_mode ?? "HUMAN";
    const resolvedApprovedByActorType =
      proposal.approved_by_actor_type ?? "HUMAN";
    const resolvedApprovedByActorId =
      proposal.approved_by_actor_id ?? proposal.decided_by ?? "approver";
    const resolvedAutonomyTierUsed = proposal.autonomy_tier_used ?? null;
    const resolvedRulepackVersion = proposal.rulepack_version ?? null;

    const now = new Date().toISOString();

    const insertPayload = {
      proposal_id: proposal.id,
      run_id: proposal.run_id,
      action_type: "EXECUTE_PROPOSAL_NOOP",
      requested_by: "execute-repair-proposal",
      requested_at: now,
      approval_mode: resolvedApprovalMode,
      approved_by_actor_type: resolvedApprovedByActorType,
      approved_by_actor_id: resolvedApprovedByActorId,
      autonomy_tier_used: resolvedAutonomyTierUsed,
      rulepack_version: resolvedRulepackVersion,
      escalated_to_human: false,
      metadata: {
        mode,
        notes: "Phase C-3A NOOP execution. No mutations performed.",
        failure_severity: proposal.failure_severity,
        source_proposal_action_type: proposal.action_type ?? null,
        source_target_kind: proposal.target_kind ?? null,
        source_target_id: proposal.target_id ?? null,
        source_reason_code: proposal.reason_code ?? null,
        source_risk_class: proposal.risk_class ?? null,
        source_is_structured_intent: proposal.is_structured_intent ?? false,
        source_autonomy_tier_requested: proposal.autonomy_tier_requested ?? null,
        source_rulepack_version: proposal.rulepack_version ?? null,
        source_auto_approval_eligible: proposal.auto_approval_eligible ?? null,
        source_auto_approval_evaluated_at: proposal.auto_approval_evaluated_at ?? null,
        source_auto_approval_rejection_code: proposal.auto_approval_rejection_code ?? null,
        approved_at: proposal.decided_at ?? null,
        approval_reason: proposal.decision_reason ?? null,
        resolved_approval_mode: resolvedApprovalMode,
        resolved_approved_by_actor_type: resolvedApprovedByActorType,
        resolved_approved_by_actor_id: resolvedApprovedByActorId,
        resolved_autonomy_tier_used: resolvedAutonomyTierUsed,
      },
    };

    const { data: actionRun, error: arErr } = await supabaseAdmin
      .from("repair_action_runs")
      .insert(insertPayload)
      .select(`
        id,
        proposal_id,
        run_id,
        action_type,
        requested_at,
        approval_mode,
        approved_by_actor_type,
        approved_by_actor_id,
        autonomy_tier_used,
        rulepack_version,
        verification_outcome,
        verification_completed_at
      `)
      .single();

    let finalActionRun = actionRun;

    if (arErr) {
      const code = String((arErr as { code?: string })?.code ?? "");
      const msg = String((arErr as { message?: string })?.message ?? "");
      const isDup =
        code === "23505" || msg.indexOf("uniq_action_run_per_proposal") !== -1;

      if (!isDup) {
        return json(500, {
          error: "Failed to create action run",
          detail: (arErr as { message?: string })?.message ?? String(arErr),
        });
      }

      const { data: existing, error: exErr } = await supabaseAdmin
        .from("repair_action_runs")
        .select(`
          id,
          proposal_id,
          run_id,
          action_type,
          requested_at,
          approval_mode,
          approved_by_actor_type,
          approved_by_actor_id,
          autonomy_tier_used,
          rulepack_version,
          verification_outcome,
          verification_completed_at
        `)
        .eq("proposal_id", proposal.id)
        .single();

      if (exErr || !existing) {
        return json(500, {
          error: "Failed to resolve existing action run",
          detail: exErr?.message ?? exErr,
        });
      }
      finalActionRun = existing;
    }

    const target_system =
      (proposal as { evidence?: { run?: { target_system?: string } } })?.evidence?.run
        ?.target_system ?? "governance_dashboard";

    const { error: approvalExecStartErr } = await supabaseAdmin
      .from("repair_approval_events")
      .insert([
        {
          repair_proposal_id: proposal.id,
          repair_action_run_id: finalActionRun!.id,
          event_type: "REPAIR_EXECUTION_STARTED",
          actor_type: "SYSTEM",
          actor_id: "execute-repair-proposal",
          action_type: proposal.action_type ?? "EXECUTE_PROPOSAL_NOOP",
          target_kind: proposal.target_kind ?? null,
          target_id: proposal.target_id ?? null,
          autonomy_tier: resolvedAutonomyTierUsed,
          rulepack_version: resolvedRulepackVersion,
          eligibility_result: null,
          rejection_reason_code: null,
          event_payload: {
            mode,
            worker_actor_id: actor_id,
            approval_mode: resolvedApprovalMode,
            approved_by_actor_type: resolvedApprovedByActorType,
            approved_by_actor_id: resolvedApprovedByActorId,
          },
        },
      ]);

    if (approvalExecStartErr) {
      console.error(
        "[C3] repair_approval_events execution-start insert failed",
        approvalExecStartErr,
      );
    }

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

    const { error: evt3 } = await supabaseAdmin.from("repair_execution_events").insert({
      action_run_id: finalActionRun!.id,
      event_type: "VERIFICATION_STARTED",
      actor_type: "SYSTEM",
      actor_id: "execute-repair-proposal",
      details: {
        note: "Re-running harness for post-repair verification",
      },
    });
    if (evt3) console.error("[C3] event insert failed", evt3);

    const verifyUrl = `${SUPABASE_URL}/functions/v1/harness-run`;

    const verifyRes = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        phase: "harness",
        target_system: target_system,
        source: "repair-verification",
      }),
    });

    const verifyText = await verifyRes.text();
    let verificationPayload: Record<string, unknown>;

    try {
      verificationPayload = JSON.parse(verifyText) as Record<string, unknown>;
    } catch {
      verificationPayload = {
        error: "Non-JSON response from harness-run",
        raw: verifyText,
      };
    }

    let verificationEvent = "VERIFIED_FAIL";
    let verificationOutcome:
      | "VERIFIED_SUCCESS"
      | "VERIFIED_FAILURE"
      | "VERIFICATION_INCONCLUSIVE"
      | "VERIFICATION_TIMED_OUT" = "VERIFIED_FAILURE";

    if (verifyRes.ok && verificationPayload?.overall_status === "PASS") {
      verificationEvent = "VERIFIED_PASS";
      verificationOutcome = "VERIFIED_SUCCESS";
    } else if (!verifyRes.ok) {
      verificationOutcome = "VERIFICATION_INCONCLUSIVE";
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

    const verificationCompletedAt = new Date().toISOString();

    const { error: updateRunErr } = await supabaseAdmin
      .from("repair_action_runs")
      .update({
        verification_outcome: verificationOutcome,
        verification_completed_at: verificationCompletedAt,
      })
      .eq("id", finalActionRun!.id);

    if (updateRunErr) {
      console.error("[C3] repair_action_runs verification update failed", updateRunErr);
    }

    const { error: approvalExecCompleteErr } = await supabaseAdmin
      .from("repair_approval_events")
      .insert([
        {
          repair_proposal_id: proposal.id,
          repair_action_run_id: finalActionRun!.id,
          event_type: "VERIFICATION_COMPLETED",
          actor_type: "SYSTEM",
          actor_id: "execute-repair-proposal",
          action_type: proposal.action_type ?? "EXECUTE_PROPOSAL_NOOP",
          target_kind: proposal.target_kind ?? null,
          target_id: proposal.target_id ?? null,
          autonomy_tier: resolvedAutonomyTierUsed,
          rulepack_version: resolvedRulepackVersion,
          eligibility_result: verificationOutcome,
          rejection_reason_code: null,
          event_payload: {
            verification_event: verificationEvent,
            verification_outcome: verificationOutcome,
            verification_run_id: verificationPayload?.run_id ?? null,
            overall_status: verificationPayload?.overall_status ?? "UNKNOWN",
            http_status: verifyRes.status,
            ok: verifyRes.ok,
            approval_mode: resolvedApprovalMode,
            approved_by_actor_type: resolvedApprovedByActorType,
            approved_by_actor_id: resolvedApprovedByActorId,
          },
        },
      ]);

    if (approvalExecCompleteErr) {
      console.error(
        "[C3] repair_approval_events verification-complete insert failed",
        approvalExecCompleteErr,
      );
    }

    try {
      const verificationRunId =
        typeof verificationPayload?.run_id === "string"
          ? verificationPayload.run_id
          : null;
      const overall =
        typeof verificationPayload?.overall_status === "string"
          ? verificationPayload.overall_status
          : "UNKNOWN";
      const sev =
        typeof verificationPayload?.failure_severity === "string"
          ? verificationPayload.failure_severity
          : null;

      const observation =
        verificationEvent === "VERIFIED_PASS"
          ? `Verification PASS after execution (${mode}).`
          : `Verification did not PASS after execution (${mode}). Status=${overall}.`;

      const hypothesis =
        verificationEvent === "VERIFIED_PASS"
          ? "Repair path appears compatible with current failure pattern or the failure condition was transient."
          : "Repair scope may not address the underlying cause, or a governance switch/posture rule remains active.";

      const recommendation =
        verificationEvent === "VERIFIED_PASS"
          ? "Consider reusing this proposal shape for similar failures (bounded, verified)."
          : "Future proposals should re-check active governance switches and expand root-cause evidence before execution.";

      await supabaseAdmin.from("learning_records").insert({
        source: "repair_verification",
        proposal_id: proposal.id,
        action_run_id: finalActionRun!.id,
        verification_run_id: verificationRunId,
        outcome: verificationEvent,
        severity: sev,
        observation,
        hypothesis,
        recommendation,
        evidence: {
          mode,
          verify_url: verifyUrl,
          http_status: verifyRes.status,
          ok: verifyRes.ok,
          verification: {
            run_id: verificationRunId,
            overall_status: verificationPayload?.overall_status ?? null,
            failure_severity: verificationPayload?.failure_severity ?? null,
            failed_checks: verificationPayload?.failed_checks ?? null,
            total_checks: verificationPayload?.total_checks ?? null,
          },
          links: {
            proposal_id: proposal.id,
            action_run_id: finalActionRun!.id,
          },
          timestamp: new Date().toISOString(),
        },
        status: "DRAFT",
        action_type: proposal.action_type ?? null,
        target_kind: proposal.target_kind ?? null,
        target_id: proposal.target_id ?? null,
        proposal_reason_code: proposal.reason_code ?? null,
        precondition_snapshot_json: null,
        verification_outcome: verificationOutcome,
        escalation_required: false,
        retry_count: null,
        rulepack_version: resolvedRulepackVersion,
        autonomy_tier_used: resolvedAutonomyTierUsed,
      });
    } catch (e) {
      console.error("[D1] learning_records insert failed", e);
    }

    return json(200, {
      ok: true,
      proposal_id: proposal.id,
      action_run_id: finalActionRun!.id,
      mode,
      status: "EXECUTED_NOOP",
      approval_mode: resolvedApprovalMode,
      approved_by_actor_type: resolvedApprovedByActorType,
      approved_by_actor_id: resolvedApprovedByActorId,
      autonomy_tier_used: resolvedAutonomyTierUsed,
      rulepack_version: resolvedRulepackVersion,
      verification: verificationEvent === "VERIFIED_PASS" ? "PASS" : "FAIL",
      verification_outcome: verificationOutcome,
    });
  } catch (err) {
    console.error("[C3] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});