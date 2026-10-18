// Deletes one or more photos — removes the storage file(s) AND the DB row(s).
// Service-role + passcode gated so it can never be triggered from the public side.
// Also removes any edited copy.
import { createClient } from "@supabase/supabase-js";
import { deleteObjects } from "./_r2.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, photoIds } = b;

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "photoIds (array) required" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. look up the rows so we know which files to remove
  const { data: rows, error: selErr } = await supabase
    .from("photos").select("id, storage_path, edited_path, crops").in("id", photoIds);
  if (selErr) return { statusCode: 500, body: JSON.stringify({ error: selErr.message }) };
  if (!rows || rows.length === 0) {
    return { statusCode: 404, body: JSON.stringify({ error: "No matching photos" }) };
  }

  // 2. collect every storage path (original + edited + social crops) and remove from R2
  const paths = [];
  for (const r of rows) {
    if (r.storage_path) paths.push(r.storage_path);
    if (r.edited_path) paths.push(r.edited_path);
    if (r.crops && typeof r.crops === "object") {
      for (const k of Object.keys(r.crops)) { if (r.crops[k]) paths.push(r.crops[k]); }
    }
  }
  if (paths.length) {
    // don't hard-fail on storage errors — still clear the rows so they vanish from the UI
    try { await deleteObjects(paths); }
    catch (e) { console.error("R2 remove warning:", e.message); }
  }

  // 3. delete the rows
  const ids = rows.map((r) => r.id);
  const { error: delErr } = await supabase.from("photos").delete().in("id", ids);
  if (delErr) return { statusCode: 500, body: JSON.stringify({ error: delErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, deleted: ids.length }) };
}
