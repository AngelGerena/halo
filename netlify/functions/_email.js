// Premium HALO email template. Inline styles (email clients strip <style>).
// Brand: ink #1C2640, gold #C5A44B, bg #F2ECE4.
export function haloEmail({ heading, subhead, body, ctaText, ctaUrl, footerNote }) {
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F2ECE4;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2ECE4;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(28,38,64,.10);">
        <!-- header -->
        <tr><td style="background:#1C2640;padding:30px 36px;text-align:center;">
          <img src="https://halo.finessemedia.pro/halo-icon-512.png" alt="HALO" width="56" height="56" style="display:inline-block;width:56px;height:56px;border-radius:14px;margin-bottom:12px;" />
          <div style="color:#F2ECE4;font-size:30px;letter-spacing:3px;font-weight:bold;">HALO</div>
          <div style="color:#C5A44B;font-size:10px;letter-spacing:4px;text-transform:uppercase;margin-top:6px;">Holy moments, auto-curated</div>
        </td></tr>
        <!-- body -->
        <tr><td style="padding:38px 36px 30px;text-align:center;">
          <h1 style="margin:0 0 6px;color:#1C2640;font-size:27px;line-height:1.15;">${heading}</h1>
          ${subhead ? `<p style="margin:0 0 22px;color:#6B8CAE;font-size:14px;letter-spacing:.5px;">${subhead}</p>` : ""}
          <div style="color:#3A3530;font-size:15px;line-height:1.7;font-family:Arial,sans-serif;text-align:left;">${body}</div>
          ${ctaText && ctaUrl ? `
          <div style="margin:28px 0 6px;">
            <a href="${ctaUrl}" style="display:inline-block;background:#C5A44B;color:#1C2640;text-decoration:none;font-family:Arial,sans-serif;font-weight:bold;font-size:15px;padding:14px 30px;border-radius:10px;">${ctaText}</a>
          </div>` : ""}
        </td></tr>
        <!-- scripture strip -->
        <tr><td style="background:#F2ECE4;padding:18px 36px;text-align:center;">
          <p style="margin:0;color:#1C2640;font-style:italic;font-size:14px;">&ldquo;For I know the plans I have for you&rdquo; &mdash; Jeremiah 29:11</p>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:20px 36px;text-align:center;background:#1C2640;">
          <p style="margin:0;color:#6B8CAE;font-size:11px;font-family:Arial,sans-serif;">${footerNote || "HALO by Finesse Media"}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.HALO_FROM_EMAIL || "HALO <onboarding@resend.dev>";
  if (!key) throw new Error("RESEND_API_KEY not configured");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
  return res.json();
}

// Public base URL for links in emails. Always built server-side (never from a
// request body) so nobody can make HALO mail point somewhere else.
// Netlify sets process.env.URL to the site's primary address.
export function siteBase() {
  return String(process.env.URL || "https://halo.finessemedia.pro").replace(/\/+$/, "");
}

// Loose sanity check for a deliverable address (Resend does the real check).
export function isEmail(s) {
  return typeof s === "string" && s.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(s.trim());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send many emails with Resend's batch API (up to 100 per call), pacing calls
 * to stay under Resend's 2 requests/second limit.
 *
 * Requires HALO_FROM_EMAIL (no fallback to the Resend sandbox sender here).
 * Uses permissive validation, so one bad address does not sink the batch.
 *
 * @param {Array<{to:string, subject:string, html:string}>} messages
 * @param {{deadlineMs?:number}} opts  stop starting new calls after this time (epoch ms)
 * @returns {Promise<{ok:boolean[], sent:number, failed:number, notAttempted:number}>}
 *   ok[i] is true when message i was accepted by Resend.
 */
export async function sendEmailBatch(messages, { deadlineMs } = {}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.HALO_FROM_EMAIL;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  if (!from) throw new Error("HALO_FROM_EMAIL not configured");

  const ok = new Array(messages.length).fill(false);
  let sent = 0, failed = 0, notAttempted = 0;
  for (let start = 0; start < messages.length; start += 100) {
    const chunk = messages.slice(start, start + 100);
    if (deadlineMs && Date.now() > deadlineMs) { notAttempted += chunk.length; continue; }
    if (start > 0) await sleep(600); // <= 2 requests per second
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "x-batch-validation": "permissive",
        },
        body: JSON.stringify(chunk.map((m) => ({ from, to: m.to, subject: m.subject, html: m.html }))),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error(`Resend batch ${res.status}: ${t.slice(0, 300)}`);
        failed += chunk.length;
        continue;
      }
      const j = await res.json().catch(() => ({}));
      const bad = new Set((Array.isArray(j.errors) ? j.errors : []).map((e) => e && e.index));
      chunk.forEach((_, i) => {
        if (bad.has(i)) failed++;
        else { ok[start + i] = true; sent++; }
      });
    } catch (e) {
      console.error("Resend batch error:", e.message);
      failed += chunk.length;
    }
  }
  return { ok, sent, failed, notAttempted };
}
