// Early-access lead (retired waitlist; nothing on the site calls this now):
// saves the lead to the DB and notifies the fixed LEADS_EMAIL inbox. It no
// longer emails the requester, so it cannot be used to send HALO mail to an
// arbitrary address. Rate limited per IP. Steps are best-effort.
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail, isEmail } from "./_email.js";
import { clientIp, overLimit, tooMany } from "./_ratelimit.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  // Every field is clamped; nothing the visitor types ever chooses a recipient.
  const clip = (v, n = 200) => (v == null ? "" : String(v).slice(0, n).trim());
  const church = clip(b.church), name = clip(b.name, 120), email = clip(b.email, 254);
  const size = clip(b.size, 60), eventType = clip(b.eventType, 60), budget = clip(b.budget, 60);
  if (!email && !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please include a name or email." }) };
  }
  if (email && !isEmail(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please check the email address." }) };
  }
  // Public form: 3 requests per 10 minutes per IP.
  if (overLimit("request-access", clientIp(event), 3, 10 * 60 * 1000)) return tooMany();

  // 1. save the lead to the database (backup that never gets lost)
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("leads").insert({
      church: church || null, name: name || null, email: email || null,
      size: size || null, event_type: eventType || null, budget: budget || null,
    });
  } catch (e) { console.error("lead save warning:", e.message); }

  // 2. notify Finesse
  const to = process.env.LEADS_EMAIL || "finessemediapro@gmail.com";
  const row = (k, v) => v ? `<p style="margin:0 0 8px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>` : "";
  const internal = haloEmail({
    heading: "New early-access request",
    subhead: "HALO — new lead",
    body: `${row("Organization", church)}${row("Contact", name)}${row("Email", email)}${row("Size", size)}${row("Event", eventType)}${row("Would expect to pay", budget)}<p style="margin:14px 0 0;color:#6B8CAE;">Email the address above to follow up.</p>`,
    footerNote: "HALO early-access lead · Finesse Media",
  });
  try { await sendEmail({ to, subject: `New HALO early-access request${church ? " — " + church.slice(0, 80) : ""}`, html: internal }); }
  catch (e) { console.error("notify warning:", e.message); }

  // 3. (removed) The old auto-reply to the requester's address was dropped:
  //    this endpoint is public and retired (nothing on the site calls it), so
  //    it must never send mail to an address typed in by a stranger. Leads now
  //    go only to the fixed LEADS_EMAIL inbox above; reply from there.

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
