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

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function handler() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const base = (process.env.PUBLIC_BASE_URL || "https://halo.finessemedia.pro").replace(/\/+$/, "");
  const now = Date.now();
  const lo = new Date(now - 36 * 3600 * 1000).toISOString();
  const hi = new Date(now - 12 * 3600 * 1000).toISOString();

  // Candidate events: have an owner, no wrap sent yet.
  const { data: events, error } = await supabase.from("events")
    .select("id,name,code,owner_id,wrap_sent_at,published_at")
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
    const html = haloEmail({
      heading: `Your ${photoCount} photos are ready`,
      subhead: ev.name,
      body: `
        <p style="margin:0 0 14px;">Good morning. Here's how last night went:</p>
        <p style="margin:0 0 14px;"><strong>${photoCount}</strong> photo${photoCount === 1 ? "" : "s"} from <strong>${guestCount || 0}</strong> guest${guestCount === 1 ? "" : "s"}, and HALO picked <strong>${keptCount || 0}</strong> as the best shots.</p>
        <p style="margin:0 0 14px;">Everything is in your dashboard. When you're ready, tap <strong>Publish + notify all</strong> and every guest who left an email gets a link to download their photos.</p>
        <p style="margin:0;">Tip: look through the review queue first if you held any photos.</p>`,
      ctaText: "Open the event",
      ctaUrl: dashUrl,
      footerNote: "HALO by Finesse Media · you're getting this because you host this event",
    });
    try {
      await sendEmail({ to, subject: `${ev.name}: your ${photoCount} photos are ready`, html });
      await supabase.from("events").update({ wrap_sent_at: new Date().toISOString() }).eq("id", ev.id);
      sent++;
    } catch (e) { failed++; }
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, sent, skipped, failed }) };
}
