// HALO — printable table card. Opens a print-ready page (5x7in, portrait)
// with the event name, a large QR to the guest page, and the two-line
// instruction in English and Spanish. The host prints it from the browser
// or saves it as a PDF from the print dialog. Everything is inline so the
// page is self-contained; the QR is a high-res data URL.
import QRCode from "qrcode";

function esc(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export async function openTableCard({ eventName, subline, eventUrl, code, copies = 1 }) {
  const qr = await QRCode.toDataURL(eventUrl, { width: 1200, margin: 1, color: { dark: "#0a0410", light: "#ffffff" } });
  const url = new URL(eventUrl);
  const shortUrl = url.host.replace(/^www\./, "") + url.pathname;
  const card = `
    <section class="card">
      <div class="top">
        <div class="eyebrow">You're invited to capture</div><div class="eyebrow es">Te invitamos a capturar</div>
        <h1>${esc(eventName)}</h1>
        ${subline ? `<div class="sub">${esc(subline)}</div>` : ""}
      </div>
      <img class="qr" src="${qr}" alt="QR code" />
      <div class="how">
        <div class="step"><span class="n">1</span><span>Open your phone camera and point it at the code<br><em>Abre la cámara de tu teléfono y apúntala al código</em></span></div>
        <div class="step"><span class="n">2</span><span>Tap the link, then tap <strong>Take a photo</strong><br><em>Toca el enlace y luego <strong>Toma una foto</strong></em></span></div>
        <div class="step"><span class="n">3</span><span>See it on the big screen<br><em>Mírala en la pantalla grande</em></span></div>
      </div>
      <div class="foot">
        <div class="url">${esc(shortUrl)}</div>
        <div class="brand">No app · No account · HALO by Finesse Media</div>
      </div>
    </section>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>HALO table card · ${esc(eventName)}</title>
<style>
  @page { size: 5in 7in; margin: 0; }
  html, body { margin: 0; padding: 0; background: #e9e4ee; font-family: -apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .card { box-sizing: border-box; width: 5in; height: 7in; margin: 0 auto; background: #0a0410; color: #fff; display: flex; flex-direction: column; justify-content: space-between; padding: 0.42in 0.4in 0.34in; page-break-after: always; break-after: page; }
  .top { text-align: center; }
  .eyebrow { color: #ffb86b; font-size: 9pt; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; }
  .eyebrow.es { color: #cfa36a; font-size: 7.5pt; letter-spacing: 1.5px; margin-top: 2pt; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 600; font-size: 26pt; line-height: 1.05; margin: 8pt 0 0; }
  .sub { color: #cfc7d8; font-size: 10.5pt; margin-top: 5pt; }
  .qr { display: block; width: 2.6in; height: 2.6in; margin: 0 auto; border-radius: 14pt; background: #fff; padding: 6pt; box-sizing: border-box; }
  .how { display: grid; gap: 6pt; }
  .step { display: flex; gap: 8pt; align-items: flex-start; font-size: 10pt; line-height: 1.3; }
  .step em { color: #cfc7d8; font-style: normal; font-size: 9pt; }
  .n { flex: 0 0 auto; width: 16pt; height: 16pt; border-radius: 50%; background: #ffb86b; color: #0a0410; font-weight: 800; font-size: 10pt; display: grid; place-items: center; }
  .foot { text-align: center; }
  .url { font-weight: 700; font-size: 11pt; letter-spacing: .3px; }
  .brand { color: #9f94ad; font-size: 8pt; margin-top: 4pt; letter-spacing: .5px; }
  .screen-only { text-align: center; padding: 14pt; font-size: 10.5pt; color: #3b2f4a; }
  .screen-only button { background: #0a0410; color: #fff; border: 0; padding: 9pt 16pt; border-radius: 999px; font-size: 11pt; font-weight: 700; cursor: pointer; }
  @media print { .screen-only { display: none; } html, body { background: #fff; } .card { margin: 0; } }
</style></head><body>
<div class="screen-only">Table card for <strong>${esc(eventName)}</strong> (5 × 7 in). <button onclick="window.print()">Print or save as PDF</button><br><span style="font-size:9pt">In the print dialog, turn on “Background graphics” and set paper size to 5 × 7 if your printer asks.</span></div>
${Array.from({ length: Math.max(1, Math.min(12, copies)) }, () => card).join("")}
<script>setTimeout(function(){ try { window.print(); } catch (e) {} }, 400);</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) { alert("Please allow pop-ups to print the table card."); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
