// HALO — co-hosts for an event. Owner (or admin) only.
//   POST { eventId }                          -> { cohosts: [{ id, email, created_at }] }
//   POST { eventId, add: "email@x.com", lang } -> invites (emails them), returns list
//   POST { eventId, remove: "<cohost id>" }   -> removes, returns list
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { haloEmail, sendEmail } from "./_email.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MAX_COHOSTS = 10;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, add, remove, lang } = b;

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
      if (current.length >= MAX_COHOSTS) return { statusCode: 400, body: JSON.stringify({ error: `Up to ${MAX_COHOSTS} co-hosts per event` }) };
      const { error } = await supabase.from("event_cohosts")
        .upsert({ event_id: eventId, email, invited_by: auth.userId || null }, { onConflict: "event_id,email", ignoreDuplicates: true });
      if (error) throw error;

      // Invite email (best effort: the co-host is added even if email fails).
      try {
        const { data: ev } = await supabase.from("events").select("name, code").eq("id", eventId).single();
        const site = process.env.URL || "https://halo.finessemedia.pro";
        const es = lang === "es";
        const html = haloEmail({
          heading: es ? "Te invitaron a ayudar" : "You're invited to help host",
          subhead: esc(ev?.name || ""),
          body: es
            ? `<p>Te agregaron como coanfitrión de <strong>${esc(ev?.name)}</strong> en HALO.</p><p>Inicia sesión (o crea tu cuenta) con este correo, <strong>${esc(email)}</strong>, y el evento aparecerá en tu panel. Podrás revisar fotos, ponerlo en la pantalla y descargar todo.</p>`
            : `<p>You've been added as a co-host for <strong>${esc(ev?.name)}</strong> on HALO.</p><p>Sign in (or create your account) with this email, <strong>${esc(email)}</strong>, and the event will be in your dashboard. You can review photos, put it on the big screen and download everything.</p>`,
          ctaText: es ? "Abrir mi panel" : "Open my dashboard",
          ctaUrl: `${site}/dashboard?event=${encodeURIComponent(ev?.code || "")}`,
        });
        await sendEmail({ to: email, subject: es ? `Coanfitrión: ${ev?.name}` : `Co-host: ${ev?.name}`, html });
      } catch { /* email optional */ }
    } else if (remove) {
      const { error } = await supabase.from("event_cohosts").delete().eq("id", remove).eq("event_id", eventId);
      if (error) throw error;
    }
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cohosts: await list() }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message || "Co-host change failed" }) };
  }
}
