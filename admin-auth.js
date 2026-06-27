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
          <div style="display:inline-block;width:42px;height:42px;border-radius:50%;border:3px solid #C5A44B;margin-bottom:12px;"></div>
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
