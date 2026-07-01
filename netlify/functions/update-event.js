// Patches a small whitelist of event settings. Service-role + passcode gated,
// mirroring the other admin functions so the public bundle can never write events.
import { createClient } from "@supabase/supabase-js";

const ALLOWED = ["featured_photo_id", "is_recurring", "current_session", "connect_label", "connect_label_es", "connect_url", "category", "music_url", "music_rights_ack", "music_rights_ack_at"];

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, eventId, patch } = b;

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!eventId || typeof patch !== "object" || patch === null) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId and patch are required" }) };
  }

  const clean = {};
  for (const k of ALLOWED) {
    if (k in patch) clean[k] = patch[k];
  }
  if (Object.keys(clean).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields supplied" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase.from("events").update(clean).eq("id", eventId).select().single();
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, event: data }) };
}
