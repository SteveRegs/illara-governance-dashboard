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
    const approverToken = Deno.env.get("ILLARA_APPROVER_TOKEN") ?? "";
  if (!approverToken) return json(500, { ok: false, error: "Missing approver token secret" });

    const presented = req.headers.get("x-illara-admin-token") ?? "";

    if (presented !== approverToken) {
  return json(401, { ok: false, error: "Unauthorized" });
 }

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE = requireEnv("ILLARA_SERVICE_ROLE_KEY");
    const WORKER_TOKEN = Deno.env.get("ILLARA_WORKER_TOKEN") ?? Deno.env.get("WORKER_TOKEN") ?? "";
    if (!WORKER_TOKEN) throw new Error("Missing env var: WORKER_TOKEN or ILLARA_WORKER_TOKEN");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });


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

        // If APPROVED, immediately kick the executor-worker (server-to-server)
    // NOTE: executor-worker requires x-illara-worker-token
    let workerKick: any = null;

    if (decision === "APPROVE") {
      try {
        const workerUrl = `${SUPABASE_URL}/functions/v1/executor-worker`;

        const resp = await fetch(workerUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            // Edge Functions typically expect an apikey + authorization JWT.
            // Service role is safe here because this is internal server-to-server.
            apikey: SERVICE_ROLE,
            authorization: `Bearer ${SERVICE_ROLE}`,
            "x-illara-worker-token": WORKER_TOKEN,
          },
          body: JSON.stringify({ mode: "execute" }),
        });

        const text = await resp.text();
        workerKick = { ok: resp.ok, status: resp.status, body: text };
      } catch (e) {
        workerKick = { ok: false, error: String(e) };
      }
    }

    return json(200, { ok: true, request: data, workerKick });
  } catch (e) {
    return json(500, { ok: false, error: String(e) });
  }
});
