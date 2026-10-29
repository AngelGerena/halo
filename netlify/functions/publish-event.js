// Event OWNER (or app admin) publishes an event: marks published_at and emails
// every contributor who left an email and has at least one kept photo that
// their gallery is live.
//
// Safe to retry: each guest is emailed at most once (contributors.notified_at),
// so if the first run is cut short, pressing Publish again only reaches the
// guests who were not emailed yet. Emails go out through Resend's batch API
// (100 per call) so a wedding-size list fits inside Netlify's 10 s limit.
// Links are built from the site's own URL, never from the request.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmailBatch, siteBase, isEmail } from "./_email.js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const started = Date.now();

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId } = b; // any `origin` in the body is ignored on purpose

  const auth = await authenticate(event);
  if (!auth.ok) return json(401, { error: "Unauthorized" });
  if (!eventId) return json(400, { error: "eventId required" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Only the owner (or an app admin) may email every guest; co-hosts may not.
  if (!(await ownsEventOrAdmin(supabase, eventId, auth, { allowCohost: false }))) {
    return json(403, { error: "Only the event owner can publish and email guests." });
  }

  // Refuse to send from the Resend sandbox address (it only reaches the
  // account owner, so guests would silently get nothing).
  if (!process.env.HALO_FROM_EMAIL || !process.env.RESEND_API_KEY) {
    return json(500, { error: "Email sending is not configured (HALO_FROM_EMAIL / RESEND_API_KEY). Nothing was sent." });
  }

  const { data: ev, error: evErr } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (evErr || !ev) return json(404, { error: "Event not found" });

  // Keep the first publish time on retries.
  if (!ev.published_at) {
    await supabase.from("events").update({ published_at: new Date().toISOString() }).eq("id", eventId);
  }

  // Contributors with an email. Prefer the notified_at column for dedupe; if
  // the SQL has not been run yet, fall back to no dedupe (still batched).
  let dedupe = true;
  let { data: contribs, error: cErr } = await supabase.from("contributors")
    .select("id,name,email,notified_at").eq("event_id", eventId).not("email", "is", null);
  if (cErr) {
    dedupe = false;
    ({ data: contribs, error: cErr } = await supabase.from("contributors")
      .select("id,name,email").eq("event_id", eventId).not("email", "is", null));
  }
  if (cErr) return json(500, { error: cErr.message });

  // Kept-photo counts per contributor, read in pages (PostgREST caps rows per
  // request) instead of one count query per guest.
  const counts = new Map();
  const PAGE = 1000;
  for (let from = 0; from < 50 * PAGE; from += PAGE) {
    const { data: rows, error } = await supabase.from("photos")
      .select("contributor_id").eq("event_id", eventId).eq("kept", true)
      .order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) return json(500, { error: error.message });
    for (const r of rows || []) counts.set(r.contributor_id, (counts.get(r.contributor_id) || 0) + 1);
    if (!rows || rows.length < PAGE) break;
  }

  const base = siteBase();
  const messages = [];
  const targets = [];
  let skipped = 0, invalid = 0;
  for (const c of contribs || []) {
    if (dedupe && c.notified_at) { skipped++; continue; }
    const count = counts.get(c.id) || 0;
    if (!count) { skipped++; continue; }
    const to = String(c.email || "").trim();
    if (!isEmail(to)) { invalid++; continue; }

    const html = haloEmail({
      heading: "Your photos are ready",
      subhead: escapeHtml(ev.name),
      body: `
        <p style="margin:0 0 14px;">Hi ${escapeHtml(c.name)},</p>
        <p style="margin:0 0 14px;">The gallery for <strong>${escapeHtml(ev.name)}</strong> is now live. Your <strong>${count}</strong> curated photo${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} ready to view and share.</p>
        <p style="margin:0;">Tap below to open your personal gallery.</p>`,
      ctaText: "View my photos",
      ctaUrl: `${base}/g/${encodeURIComponent(c.id)}`,
      footerNote: `${escapeHtml(ev.host || "HALO")} · shared with love`,
    });
    messages.push({ to, subject: `Your photos from ${ev.name} are ready`, html });
    targets.push(c.id);
  }

  let result;
  try {
    // Leave time to record notified_at before Netlify's 10 s cutoff.
    result = await sendEmailBatch(messages, { deadlineMs: started + 7000 });
  } catch (e) {
    return json(500, { error: e.message });
  }

  // Mark the guests Resend accepted, so a retry never emails them twice.
  if (dedupe) {
    const done = targets.filter((_, i) => result.ok[i]);
    const now = new Date().toISOString();
    for (let i = 0; i < done.length; i += 100) {
      const { error } = await supabase.from("contributors").update({ notified_at: now }).in("id", done.slice(i, i + 100));
      if (error) console.error("notified_at warning:", error.message);
    }
  }

  return json(200, {
    ok: true,
    sent: result.sent,
    failed: result.failed + invalid,
    skipped,
    remaining: result.notAttempted, // > 0 means: press Publish again to finish
    deduped: dedupe,
  });
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
