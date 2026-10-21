// Early-access lead: notifies Finesse, saves the lead to the DB, and sends the
// requester a branded auto-reply. All steps are best-effort — a failure in one
// never blocks the others (the visitor still gets a success response).
import { createClient } from "@supabase/supabase-js";
import { haloEmail, sendEmail } from "./_email.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { church, name, email, size, eventType, budget } = b;
  if (!email && !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please include a name or email." }) };
  }

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
    body: `${row("Organization", church)}${row("Contact", name)}${row("Email", email)}${row("Size", size)}${row("Event", eventType)}${row("Would expect to pay", budget)}<p style="margin:14px 0 0;color:#6B8CAE;">Reply directly to follow up.</p>`,
    footerNote: "HALO early-access lead · Finesse Media",
  });
  try { await sendEmail({ to, subject: `New HALO early-access request${church ? " — " + church : ""}`, html: internal }); }
  catch (e) { console.error("notify warning:", e.message); }

  // 3. auto-reply to the requester
  if (email) {
    const reply = haloEmail({
      heading: `Thank you${name ? ", " + escapeHtml(name.split(" ")[0]) : ""}!`,
      subhead: "We received your request",
      body: `<p style="margin:0 0 14px;">Thanks for your interest in <strong>HALO</strong> — the effortless way to gather every photo from your event.</p>
             <p style="margin:0 0 14px;">We've saved your details and will reach out personally with early access and founding pricing very soon.</p>
             <p style="margin:0;">In the meantime, if there's a specific date or event on your mind, just reply to this email and tell us about it.</p>`,
      footerNote: "HALO by Finesse Media",
    });
    try { await sendEmail({ to: email, subject: "Thanks for your interest in HALO", html: reply }); }
    catch (e) { console.error("auto-reply warning:", e.message); }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
