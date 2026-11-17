// HALO — the morning-after email to the host.
//
// Runs once a day (schedule in netlify.toml). For every event whose photos
// stopped arriving between 12 and 36 hours ago and that hasn't had a wrap
// email yet, emails the owner: "Your 312 photos are ready", with a link to
// the event in the dashboard where one tap (Publish + notify) sends every
// guest their gallery. Marks events.wrap_sent_at so it only ever sends once.
//
// Why "last photo 12–36 h ago" rather than the event date: event_date is
// free text for display, so the upload timeline is the reliable signal.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail } from "./_email.js";
import { RETAIN_DAYS, DAY_MS, longDate } from "./_retention.js";
import { albumUrl } from "./_album.js";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const base = (process.env.PUBLIC_BASE_URL || "https://halo.finessemedia.pro").replace(/\/+$/, "");
  const now = Date.now();
  const lo = new Date(now - 36 * 3600 * 1000).toISOString();
  const hi = new Date(now - 12 * 3600 * 1000).toISOString();

  // Candidate events: have an owner, no wrap sent yet.
  const { data: events, error } = await supabase.from("events")
    .select("*")
    .is("wrap_sent_at", null).not("owner_id", "is", null);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  let sent = 0, skipped = 0, failed = 0;
  for (const ev of events || []) {
    // Latest photo for this event
    const { data: last } = await supabase.from("photos").select("created_at")
      .eq("event_id", ev.id).order("created_at", { ascending: false }).limit(1);
    const lastAt = last && last[0] ? last[0].created_at : null;
    if (!lastAt || lastAt < lo || lastAt > hi) { skipped++; continue; }

    const [{ count: photoCount }, { count: keptCount }, { count: guestCount }] = await Promise.all([
      supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
      supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", ev.id).eq("kept", true),
      supabase.from("contributors").select("id", { count: "exact", head: true }).eq("event_id", ev.id),
    ]);
    if (!photoCount) { skipped++; continue; }

    const { data: user } = await supabase.auth.admin.getUserById(ev.owner_id);
    const to = user?.user?.email;
    if (!to) { skipped++; continue; }

    const dashUrl = `${base}/dashboard?event=${encodeURIComponent(ev.code)}`;
    const { data: firstRow } = await supabase.from("photos").select("created_at")
      .eq("event_id", ev.id).order("created_at", { ascending: true }).limit(1);
    const closeAt = ev.expires_at || new Date(new Date(firstRow?.[0]?.created_at || Date.now()).getTime() + RETAIN_DAYS * DAY_MS).toISOString();
    let album = null;
    try { album = albumUrl(ev.id); } catch {}
    const html = haloEmail({
      heading: `Your ${photoCount} photos are ready`,
      subhead: esc(ev.name),
      body: `
        <p style="margin:0 0 14px;">Good morning. Here's how last night went:</p>
        <p style="margin:0 0 14px;"><strong>${photoCount}</strong> photo${photoCount === 1 ? "" : "s"} from <strong>${guestCount || 0}</strong> guest${guestCount === 1 ? "" : "s"}, and HALO picked <strong>${keptCount || 0}</strong> as the best shots.</p>
        <p style="margin:0 0 14px;">Everything is in your dashboard. When you're ready, tap <strong>Publish + notify all</strong> and every guest who left an email gets a link to download their photos.</p>
        <p style="margin:0 0 14px;">Tip: look through the review queue first if you held any photos.</p>
        ${album ? `<p style="margin:0 0 14px;">Want to send the photos to family? Here's your private album link. Anyone you send it to can view, save and share the photos, no account needed:<br><a href="${album}" style="color:#c2185b;word-break:break-all;">${album}</a></p>` : ""}
        <p style="margin:0;">Your gallery stays open for ${RETAIN_DAYS} days, until <strong>${esc(longDate(closeAt))}</strong>. We'll remind you before it closes so you can download everything.</p>`,
      ctaText: "Open the event",
      ctaUrl: dashUrl,
      footerNote: "HALO by Finesse Media · you're getting this because you host this event",
    });
    try {
      await sendEmail({ to, subject: `${ev.name}: your ${photoCount} photos are ready`, html });
      await supabase.from("events").update({ wrap_sent_at: new Date().toISOString() }).eq("id", ev.id);
      sent++;
      if (album) await emailCohosts(supabase, ev, album, photoCount, closeAt);
    } catch (e) { failed++; }
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, sent, skipped, failed }) };
}

// Co-hosts get one simple email: the album is ready, open it, no login.
// English first, then Spanish, since we don't know which they read.
async function emailCohosts(supabase, ev, album, photoCount, closeAt) {
  let rows = [];
  try {
    const { data } = await supabase.from("event_cohosts").select("email").eq("event_id", ev.id);
    rows = data || [];
  } catch { return; }
  const name = esc(ev.name);
  const until = esc(longDate(closeAt));
  for (const r of rows) {
    if (!r.email) continue;
    const html = haloEmail({
      heading: `All ${photoCount} photos, in one place`,
      subhead: name,
      body: `
        <p style="margin:0 0 14px;">The album from <strong>${name}</strong> is ready. Open it to see every photo, play the slideshow, and save or share your favorites. Send the link to anyone in the family. No account or password needed.</p>
        <p style="margin:0 0 14px;">The album stays up until <strong>${until}</strong>.</p>
        <p style="margin:0 0 6px;font-size:13px;color:#6b6b6b;"><strong>En español:</strong> el álbum de <strong>${name}</strong> ya está listo. Ábrelo para ver todas las fotos, ver la presentación y guardar o compartir tus favoritas. Envía el enlace a quien quieras de la familia. No necesitas cuenta ni contraseña.</p>`,
      ctaText: "Open the album / Abrir el álbum",
      ctaUrl: album,
      footerNote: "HALO by Finesse Media · you're getting this because you helped host this event",
    });
    try { await sendEmail({ to: r.email, subject: `${ev.name}: your album is ready`, html }); } catch {}
  }
}
