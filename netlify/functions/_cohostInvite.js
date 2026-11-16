// HALO: one-tap co-host invite links.
//
// A co-host should never hit a sign-up wall. The invite email carries a
// personal, signed link; opening it signs them in (creating their account
// quietly the first time) and drops them straight into the event.
//
// The token is stateless: "<payload>.<signature>" where payload is the
// event_cohosts row id plus an expiry, signed with a key derived from the
// service-role key (so there is no new secret or table to set up). It only
// works while that co-host row still exists, so removing a co-host kills
// their link immediately.
import { createHmac, timingSafeEqual } from "node:crypto";
import { haloEmail, sendEmail, siteBase } from "./_email.js";

export const INVITE_DAYS = 30;

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function key() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server not configured");
  return createHmac("sha256", secret).update("halo-cohost-invite-v1").digest();
}
const sign = (payload) => createHmac("sha256", key()).update(payload).digest();

export function signInvite(cohostId, days = INVITE_DAYS) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400;
  const payload = b64u(`${cohostId}.${exp}`);
  return `${payload}.${b64u(sign(payload))}`;
}

// -> null when the token is malformed or the signature is wrong,
//    else { id, expired }.
export function readInvite(token) {
  try {
    if (typeof token !== "string" || token.length > 400) return null;
    const [payload, sig, extra] = token.split(".");
    if (!payload || !sig || extra !== undefined) return null;
    const given = Buffer.from(sig, "base64url");
    const want = sign(payload);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
    const raw = Buffer.from(payload, "base64url").toString("utf8");
    const dot = raw.lastIndexOf(".");
    const id = raw.slice(0, dot);
    const exp = Number(raw.slice(dot + 1));
    if (!id || !Number.isFinite(exp)) return null;
    return { id, expired: exp * 1000 < Date.now() };
  } catch {
    return null;
  }
}

export function inviteUrl(cohostId, code) {
  return `${siteBase()}/dashboard?event=${encodeURIComponent(code || "")}&invite=${encodeURIComponent(signInvite(cohostId))}`;
}

// Send (or re-send) the invite email with a fresh one-tap link.
//   lang:  "en" | "es" | "both" (both = English then Spanish, for when we
//          don't know which language the co-host reads)
//   fresh: true when this replaces an earlier link (re-send, or the old
//          sign-in style invite), so the email says so.
export async function sendCohostInvite({ cohostId, email, ev, lang, fresh = false }) {
  const name = esc(ev?.name || "");
  const who = esc(email);
  const small = 'style="font-size:13px;color:#6b6b6b;"';
  const copy = {
    en: {
      heading: fresh ? "Your new one-tap link" : "You're invited to help host",
      cta: "Open the event",
      subject: `Co-host: ${ev?.name || "HALO"}`,
      body: (fresh
        ? `<p>Here is a fresh link for <strong>${name}</strong> on HALO, where you're a co-host. It replaces any earlier link we sent you.</p>`
        : `<p>You've been added as a co-host for <strong>${name}</strong> on HALO.</p>`)
        + `<p>Tap the button and you're in. No account to create and no password. You can see and share the photos and videos, put the event on the big screen and download everything.</p>`
        + `<p ${small}>This link is personal to <strong>${who}</strong> and works for ${INVITE_DAYS} days. Please don't forward it.</p>`,
    },
    es: {
      heading: fresh ? "Tu nuevo enlace directo" : "Te invitaron a ayudar",
      cta: "Abrir el evento",
      subject: `Coanfitrión: ${ev?.name || "HALO"}`,
      body: (fresh
        ? `<p>Aquí tienes un enlace nuevo para <strong>${name}</strong> en HALO, donde eres coanfitrión. Reemplaza cualquier enlace anterior que te enviamos.</p>`
        : `<p>Te agregaron como coanfitrión de <strong>${name}</strong> en HALO.</p>`)
        + `<p>Toca el botón y entras directo al evento. No necesitas crear cuenta ni contraseña. Podrás ver y compartir las fotos y videos, ponerlo en la pantalla y descargar todo.</p>`
        + `<p ${small}>Este enlace es personal para <strong>${who}</strong> y funciona por ${INVITE_DAYS} días. Por favor no lo reenvíes.</p>`,
    },
  };
  const both = lang === "both";
  const c = copy[lang === "es" ? "es" : "en"];
  const html = haloEmail({
    heading: c.heading,
    subhead: name,
    body: both ? `${copy.en.body}<hr style="border:0;border-top:1px solid #e7e0d6;margin:20px 0;" />${copy.es.body}` : c.body,
    ctaText: both ? `${copy.en.cta} / ${copy.es.cta}` : c.cta,
    ctaUrl: inviteUrl(cohostId, ev?.code),
  });
  await sendEmail({ to: email, subject: c.subject, html });
}
