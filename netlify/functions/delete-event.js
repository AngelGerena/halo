// HALO V2 — Delete an entire event. Removes every stored file for the event
// (originals, edited copies, social crops), then deletes the event row, which
// cascades to its contributors, photos, and reactions. Service-role + passcode.
import { createClient } from "@supabase/supabase-js";
import { deleteObjects } from "./_r2.js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!eventId) return { statusCode: 400, body: JSON.stringify({ error: "eventId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  // 1. collect every storage path tied to this event
  const { data: photos, error: selErr } = await supabase
    .from("photos").select("storage_path, edited_path, crops").eq("event_id", eventId);
  if (selErr) return { statusCode: 500, body: JSON.stringify({ error: selErr.message }) };

  const paths = [];
  for (const p of photos || []) {
    if (p.storage_path) paths.push(p.storage_path);
    if (p.edited_path) paths.push(p.edited_path);
    if (p.crops && typeof p.crops === "object") {
      for (const k of Object.keys(p.crops)) { if (p.crops[k]) paths.push(p.crops[k]); }
    }
  }

  // 2. remove files from R2 (batched inside the helper; don't hard-fail on errors)
  try { await deleteObjects(paths); }
  catch (e) { console.error("R2 remove warning:", e.message); }

  // 3. delete the event row — cascades to contributors, photos, reactions
  const { error: delErr } = await supabase.from("events").delete().eq("id", eventId);
  if (delErr) return { statusCode: 500, body: JSON.stringify({ error: delErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, removedFiles: paths.length }) };
}
