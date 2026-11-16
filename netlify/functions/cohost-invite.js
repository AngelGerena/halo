// HALO: redeem a one-tap co-host invite link (public, no login needed).
//
//   POST { token }                 -> { status: "ok", email, token_hash }
//                                     the browser trades token_hash for a
//                                     session (supabase.auth.verifyOtp), so the
//                                     co-host is signed in without a password.
//                                  -> { status: "expired" }  link too old
//                                  -> { status: "invalid" }  bad/removed invite
//   POST { token, resend: true, lang } on an expired link emails a fresh one
//                                     to the invited address -> { status: "resent" }
//
// The link only ever signs in the address the owner invited, and only while
// that co-host is still on the event.
import { createClient } from "@supabase/supabase-js";
import { readInvite, sendCohostInvite } from "./_cohostInvite.js";
import { clientIp, overLimit, tooMany } from "./_ratelimit.js";

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}

  if (overLimit("cohost-invite", clientIp(event), 30, 10 * 60 * 1000)) return tooMany();

  let inv = null;
  try { inv = readInvite(b.token); } catch { return json(500, { error: "Server not configured" }); }
  if (!inv) return json(200, { status: "invalid" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    // The invite must still exist (the owner may have removed this co-host).
    const { data: row } = await supabase.from("event_cohosts").select("id, email, event_id").eq("id", inv.id).maybeSingle();
    if (!row || !row.email) return json(200, { status: "invalid" });
    const email = String(row.email).trim().toLowerCase();

    if (inv.expired) {
      if (!b.resend) return json(200, { status: "expired" });
      // At most 3 fresh links per invite per hour (per warm instance).
      if (overLimit("cohost-resend", row.id, 3, 60 * 60 * 1000)) return tooMany();
      const { data: ev } = await supabase.from("events").select("name, code").eq("id", row.event_id).maybeSingle();
      await sendCohostInvite({ cohostId: row.id, email, ev, lang: b.lang === "es" ? "es" : "en" });
      return json(200, { status: "resent" });
    }

    // First visit: quietly create their (already confirmed) account. If they
    // already have one this is a no-op error we ignore.
    try { await supabase.auth.admin.createUser({ email, email_confirm: true }); } catch { /* already registered */ }

    const { data, error } = await supabase.auth.admin.generateLink({ type: "magiclink", email });
    const token_hash = data && data.properties && data.properties.hashed_token;
    if (error || !token_hash) return json(500, { error: "Could not sign you in. Please try again." });

    return json(200, { status: "ok", email, token_hash });
  } catch {
    return json(500, { error: "Could not sign you in. Please try again." });
  }
}
