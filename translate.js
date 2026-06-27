// Sends a premium welcome email when a contributor joins with an email address.
import { haloEmail, sendEmail } from "./_email.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { email, name, eventName, galleryUrl } = b;
  if (!email) return { statusCode: 400, body: JSON.stringify({ error: "email required" }) };

  const html = haloEmail({
    heading: `Welcome, ${escapeHtml(name || "friend")}`,
    subhead: escapeHtml(eventName || ""),
    body: `
      <p style="margin:0 0 14px;">Thank you for capturing moments at <strong>${escapeHtml(eventName || "our event")}</strong>.</p>
      <p style="margin:0 0 14px;">Every photo you upload is curated automatically &mdash; HALO keeps the sharp, well-lit shots and gently corrects them, then gathers them into your own gallery.</p>
      <p style="margin:0;">Your personal gallery link is below. Keep it &mdash; you can return to it anytime to view and share your photos.</p>`,
    ctaText: "Open my gallery",
    ctaUrl: galleryUrl,
    footerNote: "You're receiving this because you joined a HALO event.",
  });

  try {
    await sendEmail({ to: email, subject: `Welcome to ${eventName || "the event"} — your HALO gallery`, html });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
