// Sends a warm welcome + getting-started email when someone creates a HALO
// account (the self-serve /signup flow). This is separate from:
//   - notify-welcome.js  (a GUEST joined someone's event)
//   - request-access.js  (the retired founding-member waitlist)
//
// It's a plain welcome for a new HOST: no "I'll reach out," no waitlist — their
// account already exists, so the email tells them how to start using it.
//
// Called from the signup page right after the account is created. Best-effort:
// if it fails, the account is still made and the user still gets Supabase's own
// confirmation link, so we never block signup on this.
//
// Locked down: the caller sends ONLY { userId } (the id Supabase returned from
// signUp). The recipient address and name come from Supabase Auth on the
// server, the account must have been created in the last 30 minutes, and each
// account is welcomed at most once (app_metadata.halo_welcomed). So this can
// never be used to send HALO mail to an arbitrary address.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail, siteBase, isEmail } from "./_email.js";
import { clientIp, overLimit, tooMany } from "./_ratelimit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRESH_MS = 30 * 60 * 1000;
const quiet = (extra = {}) => ({ statusCode: 200, body: JSON.stringify({ ok: false, ...extra }) });

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const userId = typeof b.userId === "string" ? b.userId.trim() : "";
  if (!UUID.test(userId)) return { statusCode: 400, body: JSON.stringify({ error: "userId required" }) };

  if (overLimit("welcome-account", clientIp(event), 5, 10 * 60 * 1000)) return tooMany();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let user = null;
  try {
    const { data: got, error: uErr } = await supabase.auth.admin.getUserById(userId);
    if (!uErr && got) user = got.user;
  } catch { user = null; }
  // Unknown id (including the decoy id Supabase returns for an email that is
  // already registered): answer quietly, send nothing.
  if (!user) return quiet({ skipped: "unknown" });

  const created = Date.parse(user.created_at || "");
  if (!created || Date.now() - created > FRESH_MS) return quiet({ skipped: "not new" });
  if (user.app_metadata && user.app_metadata.halo_welcomed) return quiet({ skipped: "already welcomed" });

  const email = String(user.email || "").trim();
  if (!isEmail(email)) return quiet({ skipped: "no email" });
  const name = String((user.user_metadata && user.user_metadata.full_name) || "").slice(0, 80);
  const needsConfirm = !(user.email_confirmed_at || user.confirmed_at);

  // Mark first so two quick calls can't both send.
  try {
    await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata || {}), halo_welcomed: true },
    });
  } catch (e) { console.error("welcome-account mark warning:", e.message); }

  const firstName = name ? escapeHtml(String(name).split(" ")[0]) : "there";

  const stepRow = (num, title, text) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr>
        <td valign="top" style="width:34px;">
          <div style="width:28px;height:28px;border-radius:50%;background:#1C2640;color:#C5A44B;font-family:Arial,sans-serif;font-weight:bold;font-size:14px;text-align:center;line-height:28px;">${num}</div>
        </td>
        <td valign="top" style="padding-left:12px;">
          <p style="margin:0 0 2px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;">${title}</p>
          <p style="margin:0;color:#3A3530;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">${text}</p>
        </td>
      </tr>
    </table>`;

  // If email confirmation is on, remind them to confirm first (Supabase sends
  // the actual confirm link in its own separate email).
  const confirmLine = needsConfirm
    ? `<p style="margin:0 0 16px;">First, a quick step: check your inbox for a separate email from us to <strong>confirm your address</strong> and activate your account. Once that's done, you're ready to roll.</p>`
    : "";

  const body = `
    <p style="margin:0 0 16px;">Welcome to <strong>HALO</strong> — the effortless way to turn every guest at your event into a photographer and gather every shot into one beautiful, auto-curated gallery.</p>

    ${confirmLine}

    <p style="margin:0 0 10px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;">Getting started takes about two minutes:</p>

    ${stepRow(1, "Sign in and create your event", "Log in to your dashboard, click New Event, give it a name and date, and HALO instantly generates your custom QR code and a printable table sign.")}
    ${stepRow(2, "Put your QR code where guests will see it", "Print the sign (or show the code on a screen) and place it on tables, at the entrance, or on your program. That's all your guests need.")}
    ${stepRow(3, "Guests scan &amp; snap — no app", "Guests point their phone camera at the code and upload photos all night. Nothing to download, no account for them to make.")}
    ${stepRow(4, "Watch it come together, then share", "Photos flow into one live gallery you can project at the venue. HALO curates and enhances them automatically. After the event, download everything or share the gallery link in one tap.")}

    <div style="margin:22px 0 18px;height:1px;background:#E6DED2;"></div>

    <p style="margin:0 0 10px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;">A few tips for a great gallery:</p>
    <ul style="margin:0 0 16px;padding-left:20px;color:#3A3530;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
      <li style="margin:0 0 7px;">Set up your event a day or two <strong>before</strong> so your signs are printed and ready.</li>
      <li style="margin:0 0 7px;">Place a QR sign on <strong>every table</strong> — the more guests see it, the more photos you get.</li>
      <li style="margin:0 0 7px;">Open the <strong>live slideshow</strong> on a TV or projector during the event — guests love seeing their shots appear.</li>
    </ul>

    <p style="margin:0;">Questions, or want a hand setting up your first event? Just <strong>reply to this email</strong> — a real person reads every one.</p>`;

  const html = haloEmail({
    heading: `Welcome to HALO, ${firstName}!`,
    subhead: "Your account is ready — here's how to get started",
    body,
    ctaText: "Go to my dashboard",
    ctaUrl: `${siteBase()}/login`,
    footerNote: "HALO by Finesse Media · Reply any time — a real person reads these",
  });

  try {
    await sendEmail({ to: email, subject: `Welcome to HALO, ${firstName} — here's how to get started` , html });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    console.error("welcome-account warning:", e.message);
    // Non-fatal: signup already succeeded; don't surface an error to the client.
    return { statusCode: 200, body: JSON.stringify({ ok: false, warning: e.message }) };
  }
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
