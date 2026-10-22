// Creates + names an event. Runs server-side with the Supabase SERVICE ROLE
// key so event creation can never be triggered from the public browser bundle.
// Auth: per-user session (Supabase JWT) OR the transitional admin passcode.
import { createClient } from "@supabase/supabase-js";
import { authenticate } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const {
    name, host, event_date, code, keep_threshold,
    name_es, host_es, event_date_es,
    moderation_mode, protect_minors, category, music_url,
    ownerId, // admin-only: create an event on a specific client's behalf
  } = body;

  const auth = await authenticate(event);
  if (!auth.ok) {
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
    // Stamp ownership. An admin may create on a client's behalf by passing
    // ownerId; otherwise the event is owned by the caller. A passcode admin
    // (no user id, no ownerId) leaves it unowned (admin override) — admins
    // still manage it. Non-admins can never set another owner.
    owner_id: (auth.isAdmin && ownerId) ? ownerId : auth.userId,
    // BILLING SEAM: when Stripe is live, non-admin create sets paid=false until checkout.
    paid: true,
  }).select().single();

  if (error) {
    const msg = error.code === "23505" ? "That event code is already taken — pick another." : error.message;
    return { statusCode: 400, body: JSON.stringify({ error: msg }) };
  }
  return { statusCode: 200, body: JSON.stringify({ event: data }) };
}
