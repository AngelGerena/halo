// Patches a small whitelist of event settings. Service-role write, gated on a
// per-user session (Supabase JWT) with owner-or-admin verification, plus the
// transitional admin passcode override.
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const ALLOWED = ["featured_photo_id", "look", "challenges", "moderation_mode", "protect_minors", "is_recurring", "current_session", "connect_label", "connect_label_es", "connect_url", "category", "cover_path", "cover_focus_x", "cover_focus_y", "music_url", "music_rights_ack", "music_rights_ack_at"];

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, patch } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!eventId || typeof patch !== "object" || patch === null) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId and patch are required" }) };
  }

  const clean = {};
  for (const k of ALLOWED) {
    if (k in patch) clean[k] = patch[k];
  }
  // Reassigning ownership is admin-only. A non-admin owner must never be able
  // to change owner_id (that would let them give away or grab events).
  if ("owner_id" in patch && auth.isAdmin) {
    clean.owner_id = patch.owner_id; // may be a uuid or null (unassign)
  }
  if (Object.keys(clean).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields supplied" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const { data, error } = await supabase.from("events").update(clean).eq("id", eventId).select().single();
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, event: data }) };
}
