// HALO: email a fresh "confirm my email" link to a host whose account is not
// confirmed yet (used by the sign-in page and the "check your email" screen).
//
// Safe by design:
//   - Always answers { ok: true } so it can't be used to find out which
//     addresses have accounts.
//   - Only sends to an existing account that is still unconfirmed; confirmed
//     accounts and unknown addresses get nothing.
//   - Rate limited per IP and per address.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail, isEmail } from "./_email.js";
import { clientIp, overLimit, tooMany } from "./_ratelimit.js";
import { confirmLinkFor } from "./_confirmLink.js";

const ok = () => ({ statusCode: 200, body: JSON.stringify({ ok: true }) });

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 254) : "";
  if (!isEmail(email)) return { statusCode: 400, body: JSON.stringify({ error: "email required" }) };

  if (overLimit("resend-confirm", clientIp(event), 5, 15 * 60 * 1000)) return tooMany();
  if (overLimit("resend-confirm-addr", email, 3, 15 * 60 * 1000)) return ok();

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // Unknown addresses fail here (no account is ever created). For a known one,
  // generateLink returns the account, so we check it is still unconfirmed.
  const got = await confirmLinkFor(supabase, email);
  if (!got) return ok();
  const u = got.user;
  if (!u || u.email_confirmed_at || u.confirmed_at) return ok(); // already confirmed: nothing to send

  const html = haloEmail({
    heading: "Confirm your email",
    subhead: "One tap and you're in",
    body: `<p style="margin:0 0 16px;">Tap the button below to confirm your email. It signs you in and opens your HALO dashboard.</p>
           <p style="margin:0;">The link works once and expires in about an hour. If it expires, just ask for a new one from the sign-in page.</p>`,
    ctaText: "Confirm my email",
    ctaUrl: got.link,
    footerNote: "HALO by Finesse Media · If you didn't create a HALO account, you can ignore this email.",
  });
  try { await sendEmail({ to: email, subject: "Confirm your HALO email", html }); }
  catch (e) { console.error("resend-confirm warning:", e.message); }
  return ok();
}
