// HALO — a guest sets (or fixes) their name after they've already added
// photos. Guests have no account; the contributor's own id (only that
// browser holds it) is the proof, same pattern as edit-photo.
import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const contributorId = String(b.contributorId || "");
  const name = String(b.name || "").trim().slice(0, 80);
  const email = b.email ? String(b.email).trim().slice(0, 160) : null;
  if (!/^[0-9a-f-]{36}$/i.test(contributorId)) return { statusCode: 400, body: JSON.stringify({ error: "contributorId required" }) };
  if (!name) return { statusCode: 400, body: JSON.stringify({ error: "name required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const patch = { name };
  if (email) patch.email = email;
  const { data, error } = await supabase.from("contributors").update(patch).eq("id", contributorId).select("id,name,email").single();
  if (error || !data) return { statusCode: 404, body: JSON.stringify({ error: "Not found" }) };
  return { statusCode: 200, body: JSON.stringify({ contributor: data }) };
}
