// Admin publishes an event: marks published_at and emails every contributor
// (who left an email) that their gallery is live. Service-role + passcode gated.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail } from "./_email.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, eventId, origin } = b;

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!eventId) return { statusCode: 400, body: JSON.stringify({ error: "eventId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: ev, error: evErr } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (evErr || !ev) return { statusCode: 404, body: JSON.stringify({ error: "Event not found" }) };

  await supabase.from("events").update({ published_at: new Date().toISOString() }).eq("id", eventId);

  // contributors with an email + at least one kept photo
  const { data: contribs } = await supabase.from("contributors")
    .select("id,name,email").eq("event_id", eventId).not("email", "is", null);

  const base = origin || "";
  let sent = 0, failed = 0;
  for (const c of contribs || []) {
    const { count } = await supabase.from("photos")
      .select("id", { count: "exact", head: true })
      .eq("contributor_id", c.id).eq("kept", true);
    if (!count) continue;

    const html = haloEmail({
      heading: "Your photos are ready",
      subhead: ev.name,
      body: `
        <p style="margin:0 0 14px;">Hi ${escapeHtml(c.name)},</p>
        <p style="margin:0 0 14px;">The gallery for <strong>${escapeHtml(ev.name)}</strong> is now live. Your <strong>${count}</strong> curated photo${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} ready to view and share.</p>
        <p style="margin:0;">Tap below to open your personal gallery.</p>`,
      ctaText: "View my photos",
      ctaUrl: `${base}/g/${c.id}`,
      footerNote: `${ev.host || "HALO"} · shared with love`,
    });
    try { await sendEmail({ to: c.email, subject: `Your photos from ${ev.name} are ready`, html }); sent++; }
    catch { failed++; }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true, sent, failed }) };
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
