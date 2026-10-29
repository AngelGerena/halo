// Sends a premium welcome email when a contributor joins with an email address.
//
// Locked down: the caller sends ONLY { contributorId }. The recipient, guest
// name, event name and gallery link are all looked up / built on the server,
// so this endpoint can never be used to send HALO-branded mail to an arbitrary
// address or with an arbitrary link. Each contributor is welcomed at most once
// (contributors.welcomed_at), and calls are rate limited per IP (generously:
// a whole wedding shares one venue Wi-Fi address).
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail, siteBase, isEmail } from "./_email.js";
import { clientIp, overLimit, tooMany } from "./_ratelimit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const contributorId = typeof b.contributorId === "string" ? b.contributorId.trim() : "";
  if (!UUID.test(contributorId)) return json(400, { error: "contributorId required" });

  // A guest joins once; 10 calls per 10 minutes per IP is plenty for a shared
  // venue Wi-Fi and stops anyone looping this endpoint.
  if (overLimit("notify-welcome", clientIp(event), 300, 10 * 60 * 1000)) return tooMany();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Prefer the welcomed_at column (send-once). If the SQL has not been run yet,
  // fall back to sending without marking.
  let hasCol = true;
  let { data: c, error } = await supabase.from("contributors")
    .select("id,name,email,event_id,welcomed_at").eq("id", contributorId).maybeSingle();
  if (error) {
    hasCol = false;
    ({ data: c, error } = await supabase.from("contributors")
      .select("id,name,email,event_id").eq("id", contributorId).maybeSingle());
  }
  if (error) return json(500, { error: "Lookup failed" });
  if (!c) return json(404, { error: "Unknown contributor" });

  const to = String(c.email || "").trim();
  if (!to || !isEmail(to)) return json(200, { ok: true, skipped: "no email" });
  if (hasCol && c.welcomed_at) return json(200, { ok: true, skipped: "already welcomed" });

  // Claim the send first (only one concurrent call can flip null -> now).
  if (hasCol) {
    const { data: claimed, error: claimErr } = await supabase.from("contributors")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("id", c.id).is("welcomed_at", null).select("id");
    if (claimErr) hasCol = false; // fail soft: send without marking
    else if (!claimed || !claimed.length) return json(200, { ok: true, skipped: "already welcomed" });
  }

  const { data: ev } = await supabase.from("events").select("name").eq("id", c.event_id).maybeSingle();
  const eventName = (ev && ev.name) || "our event";
  const name = String(c.name || "friend").slice(0, 80);
  const galleryUrl = `${siteBase()}/g/${encodeURIComponent(c.id)}`;

  const html = haloEmail({
    heading: `Welcome, ${escapeHtml(name)}`,
    subhead: escapeHtml(eventName),
    body: `
      <p style="margin:0 0 14px;">Thank you for capturing moments at <strong>${escapeHtml(eventName)}</strong>.</p>
      <p style="margin:0 0 14px;">Every photo you upload is curated automatically &mdash; HALO keeps the sharp, well-lit shots and gently corrects them, then gathers them into your own gallery.</p>
      <p style="margin:0;">Your personal gallery link is below. Keep it &mdash; you can return to it anytime to view and share your photos.</p>`,
    ctaText: "Open my gallery",
    ctaUrl: galleryUrl,
    footerNote: "You're receiving this because you joined a HALO event.",
  });

  try {
    await sendEmail({ to, subject: `Welcome to ${eventName} — your HALO gallery`, html });
    return json(200, { ok: true });
  } catch (e) {
    // Release the claim so a later retry can still welcome them.
    if (hasCol) {
      try { await supabase.from("contributors").update({ welcomed_at: null }).eq("id", c.id); } catch {}
    }
    console.error("notify-welcome warning:", e.message);
    return json(500, { error: "Could not send welcome email" });
  }
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
