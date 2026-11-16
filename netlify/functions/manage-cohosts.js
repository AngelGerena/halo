// HALO — co-hosts for an event. Owner (or admin) only.
//   POST { eventId }                          -> { cohosts: [{ id, email, created_at }] }
//   POST { eventId, add: "email@x.com", lang } -> invites (emails a one-tap link), returns list
//   POST { eventId, remove: "<cohost id>" }   -> removes, returns list
//   POST { eventId, resend: "<cohost id>", lang } -> emails that co-host a fresh one-tap link, returns list
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { sendCohostInvite } from "./_cohostInvite.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_COHOSTS = 10;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, add, remove, resend, lang } = b;

  const auth = await authenticate(event);
  if (!auth.ok) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  if (!eventId) return { statusCode: 400, body: JSON.stringify({ error: "eventId required" }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth, { allowCohost: false }))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Only the event owner can change co-hosts" }) };
  }

  const list = async () => {
    const { data, error } = await supabase.from("event_cohosts").select("id, email, created_at")
      .eq("event_id", eventId).order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  };

  try {
    if (add) {
      const email = String(add).trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return { statusCode: 400, body: JSON.stringify({ error: "That doesn't look like an email address" }) };
      if (auth.email && email === auth.email) return { statusCode: 400, body: JSON.stringify({ error: "You already own this event" }) };
      const current = await list();
      if (current.length >= MAX_COHOSTS && !current.some((c) => c.email === email)) return { statusCode: 400, body: JSON.stringify({ error: `Up to ${MAX_COHOSTS} co-hosts per event` }) };
      const { error } = await supabase.from("event_cohosts")
        .upsert({ event_id: eventId, email, invited_by: auth.userId || null }, { onConflict: "event_id,email", ignoreDuplicates: true });
      if (error) throw error;

      // Invite email with a personal one-tap link: opening it signs the
      // co-host in and lands them in the event, no sign-up or password.
      // Re-inviting an address that is already a co-host sends a fresh link.
      // (Best effort: the co-host is added even if the email fails.)
      try {
        const [{ data: row }, { data: ev }] = await Promise.all([
          supabase.from("event_cohosts").select("id").eq("event_id", eventId).eq("email", email).maybeSingle(),
          supabase.from("events").select("name, code").eq("id", eventId).single(),
        ]);
        if (row) await sendCohostInvite({ cohostId: row.id, email, ev, lang });
      } catch { /* email optional */ }
    } else if (resend) {
      // Fresh one-tap link for someone already on the list. Unlike the first
      // invite this is NOT best effort: the owner pressed "Resend", so a
      // failed email must show as an error.
      const { data: row } = await supabase.from("event_cohosts").select("id, email").eq("id", resend).eq("event_id", eventId).maybeSingle();
      if (!row) return { statusCode: 404, body: JSON.stringify({ error: "That co-host is no longer on this event" }) };
      const { data: ev } = await supabase.from("events").select("name, code").eq("id", eventId).single();
      try {
        await sendCohostInvite({ cohostId: row.id, email: row.email, ev, lang, fresh: true });
      } catch {
        return { statusCode: 502, body: JSON.stringify({ error: "The email could not be sent. Please try again in a minute." }) };
      }
    } else if (remove) {
      const { error } = await supabase.from("event_cohosts").delete().eq("id", remove).eq("event_id", eventId);
      if (error) throw error;
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohosts: await list() }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Co-host change failed" }) };
  }
}
