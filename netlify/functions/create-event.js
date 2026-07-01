// Creates + names an event. Runs server-side with the Supabase SERVICE ROLE
// key so event creation can never be triggered from the public browser bundle.
import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const {
    passcode, name, host, event_date, code, keep_threshold,
    name_es, host_es, event_date_es,
    moderation_mode, protect_minors, category, music_url,
  } = body;

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!name || !code) {
    return { statusCode: 400, body: JSON.stringify({ error: "Name and code are required." }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.from("events").insert({
    name, host: host || null, event_date: event_date || null,
    name_es: name_es || null, host_es: host_es || null, event_date_es: event_date_es || null,
    code: code.toUpperCase(),
    keep_threshold: Number.isFinite(keep_threshold) ? keep_threshold : 45,
    moderation_mode: moderation_mode === "review" ? "review" : "off",
    protect_minors: protect_minors !== false,
    category: category || null,
    music_url: music_url || null,
  }).select().single();

  if (error) {
    const msg = error.code === "23505" ? "That event code is already taken — pick another." : error.message;
    return { statusCode: 400, body: JSON.stringify({ error: msg }) };
  }
  return { statusCode: 200, body: JSON.stringify({ event: data }) };
}
