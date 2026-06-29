// Early-access / "founding church" lead form. Emails the inquiry to Finesse.
import { haloEmail, sendEmail } from "./_email.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { church, name, email, size, eventType, budget } = b;
  if (!email && !name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please include a name or email." }) };
  }
  const to = process.env.LEADS_EMAIL || "finessemediapro@gmail.com";
  const row = (k, v) => v ? `<p style="margin:0 0 8px;"><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>` : "";
  const html = haloEmail({
    heading: "New early-access request",
    subhead: "HALO — founding church inquiry",
    body: `
      ${row("Church", church)}
      ${row("Contact", name)}
      ${row("Email", email)}
      ${row("Congregation size", size)}
      ${row("Event of interest", eventType)}
      ${row("Would expect to pay", budget)}
      <p style="margin:14px 0 0;color:#6B8CAE;">Reply directly to follow up with this church.</p>`,
    footerNote: "HALO early-access lead · Finesse Media",
  });
  try {
    await sendEmail({ to, subject: `New HALO early-access request${church ? " — " + church : ""}`, html });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
