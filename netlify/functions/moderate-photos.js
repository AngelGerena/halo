// Sets the moderation status of one or more photos.
// Service-role + passcode gated, mirroring delete-photos. The public bundle
// (anon key) cannot UPDATE photos — RLS has no update policy — so moderation
// can only happen here, behind the admin passcode.
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const ALLOWED = new Set(["approved", "pending", "hidden"]);

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { photoIds, status } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "photoIds (array) required" }) };
  }
  if (!ALLOWED.has(status)) {
    return { statusCode: 400, body: JSON.stringify({ error: "status must be approved, pending, or hidden" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Ownership: every target photo must belong to an event the caller owns (or admin).
  const { data: targets, error: tErr } = await supabase
    .from("photos").select("event_id").in("id", photoIds);
  if (tErr) return { statusCode: 500, body: JSON.stringify({ error: tErr.message }) };
  const eventIds = [...new Set((targets || []).map((r) => r.event_id).filter(Boolean))];
  if (eventIds.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: "No matching photos" }) };
  }
  for (const eid of eventIds) {
    if (!(await ownsEventOrAdmin(supabase, eid, auth))) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }
  }

  const { data, error } = await supabase
    .from("photos").update({ status }).in("id", photoIds).select("id");
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, updated: (data || []).length, status }) };
}
