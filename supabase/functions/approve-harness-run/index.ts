import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-illara-admin-token",
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  try {
    const approverToken = requireEnv("APPROVER_TOKEN");
    const presented = req.headers.get("x-illara-admin-token") ?? "";

    if (presented !== approverToken) {
      return json(401, { ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } }
    );

    const body = await req.json().catch(() => null);
    if (!body?.request_id || !body?.decision) {
      return json(400, { ok: false, error: "request_id and decision required" });
    }

    const decision = body.decision;
    if (!["APPROVE", "REJECT"].includes(decision)) {
      return json(400, { ok: false, error: "decision must be APPROVE or REJECT" });
    }

    const { data: row } = await supabase
      .from("harness_run_requests")
      .select("id, status")
      .eq("id", body.request_id)
      .maybeSingle();

    if (!row) return json(404, { ok: false, error: "Request not found" });
    if (row.status !== "PENDING") {
      return json(409, { ok: false, error: `Cannot decide from status ${row.status}` });
    }

    const { data, error } = await supabase
      .from("harness_run_requests")
      .update({
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approved_at: new Date().toISOString(),
        approved_by: body.approved_by ?? "operator",
        approval_reason: body.reason ?? null,
      })
      .eq("id", body.request_id)
      .eq("status", "PENDING")
      .select()
      .maybeSingle();

    if (error) {
      return json(500, { ok: false, error: error.message });
    }

    return json(200, { ok: true, request: data });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});
