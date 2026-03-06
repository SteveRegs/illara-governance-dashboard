import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-approver-token, x-illara-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type Decision = "APPROVE" | "REJECT";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    // Authority gate (approver token)
    const approverToken = Deno.env.get("ILLARA_APPROVER_TOKEN") ?? "";
    if (!approverToken) {
      return json(500, { ok: false, error: "Missing approver token secret" });
    }

    const presented =
      req.headers.get("x-illara-approver-token") ??
      req.headers.get("x-illara-admin-token") ??
      "";
    if (presented !== approverToken) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // Token for executor-worker (worker gate)
    const ILLARA_WORKER_TOKEN = Deno.env.get("ILLARA_WORKER_TOKEN") ?? "";
    if (!ILLARA_WORKER_TOKEN) {
      throw new Error("Missing env var: ILLARA_WORKER_TOKEN");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => null);
    if (!body?.request_id || !body?.decision) {
      return json(400, { ok: false, error: "request_id and decision required" });
    }

    const decisionRaw = String(body.decision).toUpperCase();
    if (decisionRaw !== "APPROVE" && decisionRaw !== "REJECT") {
      return json(400, { ok: false, error: "decision must be APPROVE or REJECT" });
    }
    const decision = decisionRaw as Decision;

    // Optional metadata from UI
    const operator = String(body.approved_by ?? "operator"); // keep your existing field name
    const operatorLabel = String(body.approved_by_label ?? operator); // nicer display label
    const note = body.note ?? body.reason ?? null; // accept either naming
    const reason = body.reason ?? null;

    // Load current row (mostly for clearer errors)
    const { data: row, error: readErr } = await supabase
      .from("harness_run_requests")
      .select("id, status")
      .eq("id", body.request_id)
      .maybeSingle();

    if (readErr) return json(500, { ok: false, error: readErr.message });
    if (!row) return json(404, { ok: false, error: "Request not found" });
    if (row.status !== "PENDING") {
      return json(409, { ok: false, error: `Cannot decide from status ${row.status}` });
    }

    const now = new Date().toISOString();
    const toStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";

    // Build update patch (do NOT write approved_* fields on reject, and vice versa)
    const patch: Record<string, unknown> = {
      status: toStatus,
    };

    if (decision === "APPROVE") {
      patch.approved_at = now;
      patch.approved_by = operator; // your schema uses text
      patch.approved_by_label = operatorLabel;
      patch.approval_note = note;
      patch.approval_reason = reason;
    } else {
      patch.rejected_at = now;
      patch.rejected_by = operator; // schema shows uuid for rejected_by; but your UI may send text.
      // To avoid type blowups, we store as note if rejected_by isn't a UUID.
      // Best: pass a UUID here if you have one. For now, we store label + note.
      patch.rejection_note = note;
      // If rejected_by is uuid in your schema and you don't have it, leave it null.
      // You can also add rejected_by_label later if you want symmetry.
    }

    // Atomic transition: only update if still PENDING
    const { data: updated, error: upErr } = await supabase
      .from("harness_run_requests")
      .update(patch)
      .eq("id", body.request_id)
      .eq("status", "PENDING")
      .select("*")
      .maybeSingle();

    if (upErr) return json(500, { ok: false, error: upErr.message });
    if (!updated) {
      return json(409, { ok: false, error: "Request status changed; could not apply decision" });
    }

    // Append-only audit event
    const { error: evErr } = await supabase.from("harness_request_events").insert({
      request_id: body.request_id,
      event_type: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      actor_type: "approver",
      actor_id: operator,
      actor_label: operatorLabel,
      from_status: "PENDING",
      to_status: toStatus,
      meta: { note, reason },
    });

    // If audit fails, we return loud error (decision already applied)
    if (evErr) {
      return json(500, {
        ok: false,
        error: "Decision applied but failed to write audit event",
        detail: evErr.message,
        request: updated,
      });
    }

    // If APPROVED, kick the executor-worker (server-to-server)
    let workerKick: any = null;

    if (decision === "APPROVE") {
      try {
        const workerUrl = `${SUPABASE_URL}/functions/v1/executor-worker`;

        const resp = await fetch(workerUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "x-illara-worker-token": ILLARA_WORKER_TOKEN,
          },
          body: JSON.stringify({ mode: "execute" }),
        });

        const text = await resp.text();
        workerKick = { ok: resp.ok, status: resp.status, body: text };
      } catch (e) {
        workerKick = { ok: false, error: String(e) };
      }
    }

    return json(200, { ok: true, request: updated, workerKick });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});