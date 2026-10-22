// HALO V2 Phase 3b — Tagging. Adds or removes a single tag across photo ids.
// Service-role + passcode gated (anon cannot UPDATE photos under RLS).
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const ALLOWED = new Set(["worship", "baptism", "kids", "fellowship"]);

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { photoIds, tag, op } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "photoIds (array) required" }) };
  }
  if (!ALLOWED.has(tag) || !["add", "remove"].includes(op)) {
    return { statusCode: 400, body: JSON.stringify({ error: "valid tag and op (add|remove) required" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: rows, error: selErr } = await supabase.from("photos").select("id, tags, event_id").in("id", photoIds);
  if (selErr) return { statusCode: 500, body: JSON.stringify({ error: selErr.message }) };

  // Ownership: every target photo's event must belong to the caller (or admin).
  const eventIds = [...new Set((rows || []).map((r) => r.event_id).filter(Boolean))];
  if (eventIds.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: "No matching photos" }) };
  }
  for (const eid of eventIds) {
    if (!(await ownsEventOrAdmin(supabase, eid, auth))) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }
  }

  for (const r of rows || []) {
    const cur = new Set(r.tags || []);
    if (op === "add") cur.add(tag); else cur.delete(tag);
    const { error: uErr } = await supabase.from("photos").update({ tags: Array.from(cur) }).eq("id", r.id);
    if (uErr) return { statusCode: 500, body: JSON.stringify({ error: uErr.message }) };
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, count: (rows || []).length, tag, op }) };
}
