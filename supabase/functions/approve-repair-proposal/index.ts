// approve-repair-proposal (Phase C-2)
// - Requires approver token
// - Updates proposal_status + decision metadata
// - Appends repair_proposal_events row
// - Does NOT execute any repair

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
    // Canonical env reads (aligned with your system’s pattern)
    const SUPABASE_URL = Deno.env.get("PROJECT_URL");
    const ENV_SERVICE_ROLE_KEY = Deno.env.get("PROJECT_SERVICE_ROLE_KEY");
    const ENV_ANON_KEY = Deno.env.get("ILLARA_ANON_KEY");

    if (!SUPABASE_URL || !ENV_SERVICE_ROLE_KEY || !ENV_ANON_KEY) {
      return json(500, { error: "Missing required environment configuration" });
    }

    // Guard: service role must look like a 3-part JWT
    if (ENV_SERVICE_ROLE_KEY.split(".").length !== 3) {
      return json(500, { error: "Invalid service role key format (expected JWT)" });
    }

    // Approver token check (reuse the same secret pattern you already use)
    // If approve-harness-run uses a different env name, set this secret to match.
    const expectedApproverToken =
      Deno.env.get("ILLARA_APPROVER_TOKEN") ?? Deno.env.get("APPROVER_TOKEN");

    const suppliedApproverToken =
      req.headers.get("x-illara-approver-token") ?? "";

    if (!expectedApproverToken) {
      return json(500, { error: "Approver token secret not configured" });
    }

    if (!suppliedApproverToken || !safeEqual(suppliedApproverToken, expectedApproverToken)) {
      return json(401, { error: "Invalid approver token" });
    }

    const body = await req.json().catch(() => ({} as any));
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

    // One Supabase client (service_role via auth override)
    const supabaseAdmin = createClient(SUPABASE_URL, ENV_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${ENV_SERVICE_ROLE_KEY}`,
        },
      },
      auth: { persistSession: false },
    });

    // Load proposal
    const { data: proposal, error: readErr } = await supabaseAdmin
      .from("repair_proposals")
      .select("*")
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

    // Optional policy gate (conservative defaults)
    // Example: block approving "critical" without an admin path (keep for later)
    // if (decision === "APPROVE" && proposal.failure_severity === "critical") {
    //   return json(403, { error: "Critical repairs require admin approval" });
    // }

    const newStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const decidedAt = new Date().toISOString();

    // Update proposal (immutability trigger allows these fields)
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("repair_proposals")
      .update({
        proposal_status: newStatus,
        decided_at: decidedAt,
        decided_by: actor_id,
        decision_reason: reason,
      })
      .eq("id", proposal_id)
      .select("id, proposal_status, decided_at, decided_by, decision_reason, run_id, failure_severity")
      .single();

    if (updErr || !updated) {
      return json(500, { error: "Failed to update proposal status", detail: updErr?.message ?? updErr });
    }

    // Append event (best-effort but should normally succeed)
    const { error: evtErr } = await supabaseAdmin.from("repair_proposal_events").insert([
      {
        proposal_id: proposal_id,
        event_type: newStatus, // APPROVED or REJECTED
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

    return json(200, { ok: true, proposal: updated });
  } catch (err) {
    console.error("[C2] Unexpected error", err);
    return json(500, { error: "Unexpected error", detail: String(err) });
  }
});
