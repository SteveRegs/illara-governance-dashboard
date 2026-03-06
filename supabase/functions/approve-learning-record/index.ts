// approve-learning-record (Phase D-2)
// - Requires approver token
// - Updates learning_records.status + review metadata
// - Appends learning_review_events row (append-only)
// - Does NOT execute anything

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

type LearningStatus = "DRAFT" | "REVIEWED" | "PROMOTED" | "REJECTED";
type Decision = "REVIEW" | "PROMOTE" | "REJECT";

function isValidTransition(from: LearningStatus, to: LearningStatus): boolean {
  if (from === "DRAFT" && to === "REVIEWED") return true;
  if (from === "REVIEWED" && to === "PROMOTED") return true;
  if ((from === "DRAFT" || from === "REVIEWED") && to === "REJECTED") return true;
  return false;
}

function mapDecisionToStatus(decision: Decision): LearningStatus {
  if (decision === "REVIEW") return "REVIEWED";
  if (decision === "PROMOTE") return "PROMOTED";
  return "REJECTED";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    // Canonical env reads
    const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").trim();
    const SUPABASE_SERVICE_ROLE_KEY = (
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    ).trim();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }

    // Approver token check
    const expectedApproverToken =
      Deno.env.get("ILLARA_APPROVER_TOKEN") ?? "";

    const suppliedApproverToken =
      req.headers.get("x-illara-approver-token") ?? "";

    if (!expectedApproverToken) {
      return json(500, { error: "Approver token secret not configured" });
    }

    if (!suppliedApproverToken || !safeEqual(suppliedApproverToken, expectedApproverToken)) {
      return json(401, { error: "Invalid approver token" });
    }

    // Body
    const body = await req.json().catch(() => ({} as any));
    const learning_id = String(body?.learning_id ?? "");
    const decision = String(body?.decision ?? "").toUpperCase() as Decision; // REVIEW | PROMOTE | REJECT
    const reason = String(body?.reason ?? "");
    const actor_id = String(body?.actor_id ?? "approver");

    if (!learning_id) return json(400, { error: "learning_id is required" });
    if (decision !== "REVIEW" && decision !== "PROMOTE" && decision !== "REJECT") {
      return json(400, { error: "decision must be REVIEW, PROMOTE, or REJECT" });
    }
    if (!reason || reason.trim().length < 3) {
      return json(400, { error: "reason is required" });
    }

    // One Supabase client (service role)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Load current learning record
    const { data: learning, error: readErr } = await supabaseAdmin
      .from("learning_records")
      .select("id,status,outcome,severity,proposal_id,action_run_id,verification_run_id")
      .eq("id", learning_id)
      .single();

    if (readErr || !learning) {
      return json(404, { error: "learning record not found", detail: readErr?.message ?? readErr });
    }

    const currentStatus = String(learning.status ?? "DRAFT").toUpperCase() as LearningStatus;
    const nextStatus = mapDecisionToStatus(decision);

    if (!isValidTransition(currentStatus, nextStatus)) {
      return json(409, {
        error: "Invalid status transition",
        current_status: currentStatus,
        attempted_status: nextStatus,
      });
    }

    const reviewedAt = new Date().toISOString();

    // Update status + review metadata (immutability trigger should allow these fields only)
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("learning_records")
      .update({
        status: nextStatus,
        reviewed_at: reviewedAt,
        reviewed_by: actor_id,
        review_reason: reason,
      })
      .eq("id", learning_id)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return json(500, {
        error: "Failed to update learning record",
        detail: updateErr?.message ?? updateErr,
      });
    }

    // Append review event (append-only)
    const eventType =
      nextStatus === "REVIEWED" ? "REVIEWED" : nextStatus === "PROMOTED" ? "PROMOTED" : "REJECTED";

    const { error: eventErr } = await supabaseAdmin
      .from("learning_review_events")
      .insert({
        learning_id: learning_id,
        event_type: eventType,
        actor_type: "HUMAN",
        actor_id: actor_id,
        reason: reason,
        details: {
          from_status: currentStatus,
          to_status: nextStatus,
          decision,
          outcome: learning.outcome ?? null,
          severity: learning.severity ?? null,
          proposal_id: learning.proposal_id ?? null,
          action_run_id: learning.action_run_id ?? null,
          verification_run_id: learning.verification_run_id ?? null,
        },
      });

    if (eventErr) {
      // We still return success because status update succeeded.
      console.error("[D2] learning_review_events insert failed", eventErr);
    }

    return json(200, {
      ok: true,
      learning: {
        id: updated.id,
        status: updated.status,
        reviewed_at: updated.reviewed_at,
        reviewed_by: updated.reviewed_by,
        review_reason: updated.review_reason,
        outcome: updated.outcome,
        severity: updated.severity,
      },
    });
  } catch (err) {
    console.error("[D2] Unexpected error in approve-learning-record", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});
