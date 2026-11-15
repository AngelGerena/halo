// HALO — nightly 60-day gallery retention (schedule in netlify.toml).
//
// 1. Start the clock: a one-time event's gallery closes 60 days after its
//    first photo. Sets events.expires_at the first night it has photos.
// 2. Remind the host (and co-hosts) 30, 7 and 1 day before it closes, with
//    the date and a live countdown picture (countdown-img.js) that updates
//    every time the email is opened.
// 3. Close it: once expires_at passes, delete every photo file (original,
//    edited, video, social crops) from R2 and the photo rows, then stamp
//    closed_at. The event row, cover and guestbook stay, so the host's
//    dashboard and the guest pages can say "this gallery has closed".
// 4. Recurring events (weekly services) never close; any photo older than
//    60 days is removed instead.
//
// Set RETENTION_DRY_RUN=1 in Netlify to log what would be deleted without
// deleting anything (emails still go out).
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail, siteBase } from "./_email.js";
import { deleteObjects } from "./_r2.js";
import { RETAIN_DAYS, DAY_MS, NOTICE_DAYS, longDate, timeLeft } from "./_retention.js";

const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TIME_BUDGET_MS = 22000; // scheduled functions get ~30 s; leave headroom
const BATCH = 500;

function pathsOf(rows) {
  const out = [];
  for (const r of rows) {
    if (r.storage_path) out.push(r.storage_path);
    if (r.edited_path) out.push(r.edited_path);
    if (r.video_path) out.push(r.video_path);
    if (r.crops && typeof r.crops === "object") for (const k of Object.keys(r.crops)) if (r.crops[k]) out.push(r.crops[k]);
  }
  return out;
}

// Delete photos (files first, then rows) matching a query, in batches, until
// none are left or time runs out. Returns { deleted, done }.
async function purge(supabase, applyFilter, started, dryRun) {
  let deleted = 0;
  for (;;) {
    if (Date.now() - started > TIME_BUDGET_MS) return { deleted, done: false };
    const { data: rows, error } = await applyFilter(
      supabase.from("photos").select("id, storage_path, edited_path, video_path, crops")
    ).limit(BATCH);
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return { deleted, done: true };
    if (dryRun) { console.log(`[dry run] would delete ${rows.length} photos`); return { deleted: rows.length, done: false }; }
    try { await deleteObjects(pathsOf(rows)); }
    catch (e) { console.error("R2 delete warning:", e.message); }
    const { error: delErr } = await supabase.from("photos").delete().in("id", rows.map((r) => r.id));
    if (delErr) throw new Error(delErr.message);
    deleted += rows.length;
    if (rows.length < BATCH) return { deleted, done: true };
  }
}

async function recipientsFor(supabase, ev) {
  const to = new Set();
  if (ev.owner_id) {
    try {
      const { data } = await supabase.auth.admin.getUserById(ev.owner_id);
      if (data?.user?.email) to.add(data.user.email.toLowerCase());
    } catch {}
  }
  try {
    const { data: co } = await supabase.from("event_cohosts").select("email").eq("event_id", ev.id);
    for (const c of co || []) if (c.email) to.add(String(c.email).toLowerCase());
  } catch {}
  return [...to];
}

export function reminderEmail({ ev, base, photoCount }) {
  const left = timeLeft(ev.expires_at);
  const img = (u) => `${base}/.netlify/functions/countdown-img?e=${encodeURIComponent(ev.id)}&u=${u}`;
  const cell = (u, label, value) => `
    <td style="padding:0 5px;text-align:center;vertical-align:top;">
      <img src="${img(u)}" width="96" height="64" alt="${value} ${label.toLowerCase()}" style="display:block;width:96px;height:64px;border:0;border-radius:12px;background:#1C2640;color:#C5A44B;font:bold 22px Arial,sans-serif;text-align:center;" />
      <div style="font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:2px;color:#6B8CAE;margin-top:6px;">${label}</div>
    </td>`;
  const when = left.days >= 2 ? `in ${left.days} days` : left.days === 1 ? "tomorrow" : "today";
  const dashUrl = `${base}/dashboard?event=${encodeURIComponent(ev.code)}`;
  const html = haloEmail({
    heading: `Your gallery closes ${when}`,
    subhead: esc(ev.name),
    body: `
      <p style="margin:0 0 6px;text-align:center;">Your HALO gallery closes on</p>
      <p style="margin:0 0 18px;text-align:center;font-family:Georgia,serif;font-size:21px;font-weight:bold;color:#1C2640;">${esc(longDate(ev.expires_at))}</p>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 22px;"><tr>
        ${cell("d", "DAYS", left.days)}${cell("h", "HOURS", left.hours)}${cell("m", "MINUTES", left.minutes)}
      </tr></table>
      <p style="margin:0 0 14px;">HALO keeps every gallery for ${RETAIN_DAYS} days. On that date, all ${photoCount ? `<strong>${photoCount}</strong> ` : ""}photos and videos from this event are permanently deleted, including your guests' personal galleries.</p>
      <p style="margin:0 0 14px;">To keep them, open the event and tap <strong>Download all</strong>. You'll get everything in one ZIP file.</p>
      <p style="margin:0;">Need more time? Email <a href="mailto:angel@finessemedia.pro" style="color:#1C2640;">angel@finessemedia.pro</a> before that date.</p>`,
    ctaText: "Download my photos",
    ctaUrl: dashUrl,
    footerNote: "HALO by Finesse Media · you're getting this because you host this event",
  });
  const subject = left.days >= 2 ? `${ev.name}: photos will be deleted in ${left.days} days` : `${ev.name}: last day to download your photos`;
  return { subject, html };
}

export async function handler() {
  const started = Date.now();
  const dryRun = process.env.RETENTION_DRY_RUN === "1";
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const base = siteBase();
  const now = Date.now();
  const report = { dryRun, clockStarted: 0, reminders: 0, reminderFailures: 0, closed: 0, photosDeleted: 0, recurringDeleted: 0, unfinished: 0 };

  const { data: events, error } = await supabase.from("events")
    .select("id,name,code,owner_id,is_recurring,expires_at,closed_at,expiry_notified")
    .is("closed_at", null);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  for (const ev of events || []) {
    if (Date.now() - started > TIME_BUDGET_MS) { report.unfinished++; continue; }
    try {
      // ---- recurring: rolling 60 days per photo ----
      if (ev.is_recurring) {
        const cutoff = new Date(now - RETAIN_DAYS * DAY_MS).toISOString();
        const r = await purge(supabase, (q) => q.eq("event_id", ev.id).lt("created_at", cutoff), started, dryRun);
        report.recurringDeleted += r.deleted;
        if (!r.done) report.unfinished++;
        continue;
      }

      // ---- 1. start the clock ----
      if (!ev.expires_at) {
        const { data: first } = await supabase.from("photos").select("created_at")
          .eq("event_id", ev.id).order("created_at", { ascending: true }).limit(1);
        if (!first || !first[0]) continue; // no photos yet
        // Never less than a week out, so the host always gets the 7-day and
        // 1-day reminders (e.g. a recurring event switched to one-time).
        const fromFirst = new Date(first[0].created_at).getTime() + RETAIN_DAYS * DAY_MS;
        ev.expires_at = new Date(Math.max(fromFirst, now + 7 * DAY_MS)).toISOString();
        await supabase.from("events").update({ expires_at: ev.expires_at }).eq("id", ev.id);
        report.clockStarted++;
      }
      const expMs = new Date(ev.expires_at).getTime();

      // ---- 3. close ----
      if (expMs <= now) {
        const r = await purge(supabase, (q) => q.eq("event_id", ev.id), started, dryRun);
        report.photosDeleted += r.deleted;
        if (r.done && !dryRun) {
          await supabase.from("events").update({ closed_at: new Date().toISOString() }).eq("id", ev.id);
          report.closed++;
        } else if (!r.done) report.unfinished++;
        continue;
      }

      // ---- 2. remind ----
      const daysLeft = Math.ceil((expMs - now) / DAY_MS);
      const sent = ev.expiry_notified && typeof ev.expiry_notified === "object" ? ev.expiry_notified : {};
      // The most urgent stage we've reached and not yet sent (never two at once).
      const due = NOTICE_DAYS.filter((d) => daysLeft <= d).sort((a, b) => a - b)[0];
      if (!due || sent[String(due)]) continue;
      const to = await recipientsFor(supabase, ev);
      const stamp = new Date().toISOString();
      const marked = { ...sent };
      for (const d of NOTICE_DAYS) if (d >= due) marked[String(d)] = marked[String(d)] || stamp;
      if (to.length) {
        const { count: photoCount } = await supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
        if (!photoCount) { await supabase.from("events").update({ expiry_notified: marked }).eq("id", ev.id); continue; }
        const { subject, html } = reminderEmail({ ev, base, photoCount });
        try {
          for (const addr of to) await sendEmail({ to: addr, subject, html });
          report.reminders++;
        } catch (e) { report.reminderFailures++; console.error("reminder failed", ev.id, e.message); continue; }
      }
      await supabase.from("events").update({ expiry_notified: marked }).eq("id", ev.id);
    } catch (e) {
      console.error("retention error", ev.id, e.message);
    }
  }

  console.log("gallery-retention", JSON.stringify(report));
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...report }) };
}
