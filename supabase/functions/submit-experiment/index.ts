// Public participant submission endpoint.
// Browsers can call this function with the project's publishable key, but
// the experiment_data table itself grants no direct privileges to anon.
// The server-side service key is never returned to the caller.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function safeKeyEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isAuthorizedPublishableKey(request: Request): boolean {
  const supplied = request.headers.get("apikey") ?? "";
  if (!supplied) return false;

  const candidates = new Set<string>();
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const value of Object.values(parsed)) {
        if (typeof value !== "string" || !value) continue;
        const resolved = Deno.env.get(value);
        if (resolved) candidates.add(resolved);
        candidates.add(value);
      }
    } catch (_error) {
      return false;
    }
  }
  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacyAnon) candidates.add(legacyAnon);

  for (const expected of candidates) {
    if (safeKeyEquals(supplied, expected)) return true;
  }
  return false;
}

type ServerKey = { value: string; isJwt: boolean };

function getServerKey(): ServerKey | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return { value: legacy, isJwt: true };

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const value of Object.values(parsed)) {
      if (typeof value !== "string" || !value) continue;
      const resolved = Deno.env.get(value);
      if (resolved?.startsWith("sb_secret_")) return { value: resolved, isJwt: false };
      if (value.startsWith("sb_secret_")) return { value, isJwt: false };
    }
  } catch (_error) {
    return null;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validatePayload(body: unknown): string | null {
  if (!isObject(body)) return "Submission body must be a JSON object.";
  if (typeof body.subject_id !== "string" || body.subject_id.trim().length < 1 || body.subject_id.trim().length > 64) {
    return "subject_id must contain 1 to 64 characters.";
  }
  if (body.group_type !== "human" && body.group_type !== "ai") {
    return "group_type must be human or ai.";
  }
  if (!isObject(body.daily_trades) || !Array.isArray(body.daily_trades.days) || body.daily_trades.days.length > 10) {
    return "daily_trades must contain a days array with at most 10 entries.";
  }
  if (!Array.isArray(body.chat_log) || body.chat_log.length > 2000) {
    return "chat_log must be an array with at most 2000 entries.";
  }
  if (!isObject(body.raw_answers)) return "raw_answers must be a JSON object.";
  if (!["human", "ai", "uncertain"].includes(String(body.manipulation_check))) {
    return "manipulation_check is invalid.";
  }

  const liability = [
    body.liability_self_percent,
    body.liability_advisor_percent,
    body.liability_market_percent,
  ];
  if (!liability.every((v) => isNumberInRange(v, 0, 100))) {
    return "Liability allocation values must be between 0 and 100.";
  }
  const liabilityTotal = (liability as number[]).reduce((a, b) => a + b, 0);
  if (Math.abs(liabilityTotal - 100) > 0.01) return "Liability allocation must total 100.";

  const ratings = [
    body.responsibility_shift_mean,
    body.trust_ability_mean,
    body.trust_benevolence_mean,
    body.trust_integrity_mean,
    body.future_trust_mean,
  ];
  if (!ratings.every((v) => isNumberInRange(v, 1, 7))) {
    return "Questionnaire means must be between 1 and 7.";
  }
  if (!isNumberInRange(body.final_cash, 0, 1_000_000_000_000) ||
      !Number.isInteger(body.final_shares) || Number(body.final_shares) < 0 ||
      !isNumberInRange(body.final_assets, 0, 1_000_000_000_000)) {
    return "Final account values are invalid.";
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse(405, { ok: false, error: "Method not allowed" });
  if (!isAuthorizedPublishableKey(request)) {
    return jsonResponse(401, { ok: false, error: "A valid project publishable API key is required in the apikey header." });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 250_000) return jsonResponse(413, { ok: false, error: "Submission is too large." });

  try {
    const body = await request.json();
    const validationError = validatePayload(body);
    if (validationError) return jsonResponse(400, { ok: false, error: validationError });

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serverKey = getServerKey();
    if (!projectUrl || !serverKey) {
      return jsonResponse(503, { ok: false, error: "Server-side database credentials are unavailable." });
    }

    const headers: Record<string, string> = {
      "apikey": serverKey.value,
      "Content-Type": "application/json",
      "Prefer": "return=minimal",
      "Cache-Control": "no-store",
    };
    if (serverKey.isJwt) headers["Authorization"] = "Bearer " + serverKey.value;

    const response = await fetch(projectUrl + "/rest/v1/experiment_data", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Experiment submission rejected by database:", response.status, detail.slice(0, 800));
      if (response.status === 409 || detail.includes("23505")) {
        return jsonResponse(409, { ok: false, error: "This participant ID has already been submitted." });
      }
      return jsonResponse(500, { ok: false, error: "Database rejected the experiment submission." });
    }

    return jsonResponse(200, { ok: true, submitted: true, subject_id: body.subject_id });
  } catch (error) {
    console.error("Experiment submission failed:", error instanceof Error ? error.message : "unknown error");
    return jsonResponse(400, { ok: false, error: "Invalid submission payload." });
  }
});
