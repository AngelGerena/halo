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

  // 3. auto-reply to the requester — a warm onboarding email: how HALO
  //    works (mini tutorial), what to prep, and clear next steps, so the
  //    experience feels ready-to-go from the moment they sign up.
  if (email) {
    const firstName = name ? escapeHtml(name.split(" ")[0]) : "there";

    // Small reusable styles for the tutorial steps.
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

    const prepItem = (t) => `<li style="margin:0 0 7px;">${t}</li>`;

    const body = `
      <p style="margin:0 0 16px;">You're on the list — welcome to <strong>HALO</strong>, the effortless way to gather every photo from your event into one beautiful, auto-curated gallery.</p>

      <p style="margin:0 0 10px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;">Here's how HALO works — start to finish:</p>

      ${stepRow(1, "Display your QR code", "Before your event, we set you up with a custom QR code and a printable table sign. Place it where guests will see it — tables, the entrance, the program.")}
      ${stepRow(2, "Guests scan &amp; snap", "Your guests scan the code with their phone camera — no app to download. They upload the photos they take, all night long, in seconds.")}
      ${stepRow(3, "HALO curates automatically", "Behind the scenes, HALO sorts the best shots, enhances them, and filters out the blurry ones. You don't lift a finger.")}
      ${stepRow(4, "Everyone enjoys the gallery", "Photos flow into one shared gallery — plus a live slideshow you can project at the event. After, you download everything with one tap or share the link.")}

      <div style="margin:22px 0 18px;height:1px;background:#E6DED2;"></div>

      <p style="margin:0 0 10px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;">What happens next:</p>
      <p style="margin:0 0 16px;">I'll personally reach out within <strong>1 business day</strong> to confirm your event details, lock in your founding-member pricing, and hand you your QR code and sign — ready to use. You'll be fully set up well before your event.</p>

      <p style="margin:0 0 10px;color:#1C2640;font-family:Arial,sans-serif;font-weight:bold;font-size:16px;">To hit the ground running, have these handy:</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#3A3530;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;">
        ${prepItem("Your event <strong>date</strong> and rough <strong>guest count</strong>")}
        ${prepItem("The <strong>type of event</strong> (wedding, quinceañera, service, celebration)")}
        ${prepItem("Where you'd like to place the QR signs (tables, entrance, etc.)")}
        ${prepItem("Any branding or colors you'd like on your gallery (optional)")}
      </ul>

      <p style="margin:0;">Have a date in mind already? Just <strong>reply to this email</strong> and tell me about your event — I'll get you set up even faster.</p>`;

    const reply = haloEmail({
      heading: `You're in, ${firstName}!`,
      subhead: "Here's how to get started with HALO",
      body,
      ctaText: "Reply to lock in your event",
      ctaUrl: "mailto:halo@alerts.finessemedia.pro?subject=My%20HALO%20event",
      footerNote: "HALO by Finesse Media · Reply any time — a real person reads these",
    });
    try { await sendEmail({ to: email, subject: `You're in, ${firstName} — here's how to get started with HALO` , html: reply }); }
    catch (e) { console.error("auto-reply warning:", e.message); }
  }

  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
