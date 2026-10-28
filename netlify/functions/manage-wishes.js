// HALO — host view of guestbook messages (including pending/hidden ones the
// public policy can't see) and hide / approve. Owner or admin only.
//   POST { eventId }                         -> { wishes: [...] }
//   POST { eventId, wishIds: [...], status } -> { ok, updated }
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const ALLOWED = new Set(["approved", "pending", "hidden"]);

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, wishIds, status } = b;

  const auth = await authenticate(event);
  if (!auth.ok) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  if (!eventId) return { statusCode: 400, body: JSON.stringify({ error: "eventId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  if (Array.isArray(wishIds) && wishIds.length) {
    if (!ALLOWED.has(status)) return { statusCode: 400, body: JSON.stringify({ error: "bad status" }) };
    const { data, error } = await supabase.from("wishes").update({ status })
      .in("id", wishIds).eq("event_id", eventId).select("id");
    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ ok: true, updated: (data || []).length }) };
  }

  const { data, error } = await supabase.from("wishes").select("*")
    .eq("event_id", eventId).order("created_at", { ascending: false }).limit(1000);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wishes: data || [] }) };
}
