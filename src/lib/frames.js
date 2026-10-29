// HALO photo frames. The host picks one frame per event; guests get it on
// the photos they save or share. The stored photo is never changed: the frame
// is drawn on top in the browser, so originals stay clean for the host.
//
// renderFramed(photoUrl, cfg) -> Promise<Blob> (JPEG, 1080 x 1350, 4:5)
// cfg = { style, title, date, logo: "fm" | "mono" | "none", partnerUrl }

import { publicUrl } from "./supabase.js";

export const FRAME_STYLES = ["keepsake", "gold", "arch", "party", "sponsor"];
export const FRAME_LOGOS = ["fm", "mono", "none"];
export const FM_LOGO_URL = "/frames/fm-logo.png";
export const FM_SITE = "finessemedia.pro";

const W = 1080, H = 1350;
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
const DISPLAY = "Anton, Impact, 'Arial Narrow', sans-serif";
const SANS = "'Space Grotesk', system-ui, -apple-system, sans-serif";

// Frame settings for an event, or null when the event has no frame.
export function frameFor(event) {
  if (!event || !event.frame_style || !FRAME_STYLES.includes(event.frame_style)) return null;
  return {
    style: event.frame_style,
    title: (event.frame_title || event.name || "").trim(),
    date: (event.event_date || "").trim(),
    logo: FRAME_LOGOS.includes(event.frame_logo) ? event.frame_logo : "fm",
    partnerUrl: event.frame_partner_path ? publicUrl(event.frame_partner_path) : null,
  };
}

// "Maya & Daniel" -> "M&D", "Grace Church" -> "GC"
export function monogram(title) {
  const words = String(title || "").replace(/'s\b.*$/i, "").split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  const amp = /&|\band\b|\by\b/i.test(title || "");
  const letters = words.filter((w) => !/^(&|and|y)$/i.test(w)).map((w) => w[0].toUpperCase());
  if (amp && letters.length >= 2) return `${letters[0]}&${letters[1]}`;
  return letters.slice(0, 2).join("");
}

const cache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (cache.has(src)) return cache.get(src);
  const p = new Promise((resolve) => {
    const img = new Image();
    // Same-origin files don't need CORS; R2 photos do (the bucket allows it,
    // the highlight video already relies on this).
    if (/^https?:/i.test(src) && !src.startsWith(window.location.origin)) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, p);
  p.then((v) => { if (!v) cache.delete(src); });
  return p;
}

async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`600 64px ${SERIF}`),
        document.fonts.load(`italic 500 64px ${SERIF}`),
        document.fonts.load(`400 64px ${DISPLAY}`),
        document.fonts.load(`600 20px ${SANS}`),
      ]),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
  } catch { /* fall back to system fonts */ }
}

function cover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, r = w / h;
  let sw = img.width, sh = img.height, sx = 0, sy = 0;
  if (ir > r) { sw = img.height * r; sx = (img.width - sw) / 2; }
  else { sh = img.width / r; sy = (img.height - sh) * 0.4; } // keep faces: bias toward the top
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function spaced(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; }

// Shrink a line of text until it fits maxW.
function fitText(ctx, text, font, size, maxW, min = 22) {
  let s = size;
  ctx.font = font.replace("{s}", s);
  while (s > min && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font.replace("{s}", s); }
  return s;
}

// Logo block anchored at (x, y) = its bottom-right (align "right") or centre.
function drawBrand(ctx, cfg, assets, x, yBottom, color, align = "right") {
  if (cfg.logo === "none") return;
  ctx.save();
  if (cfg.logo === "mono") {
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.font = `italic 500 52px ${SERIF}`;
    ctx.fillText(monogram(cfg.title), x, yBottom);
    ctx.restore();
    return;
  }
  const size = 62, gap = 6;
  ctx.font = `600 17px ${SANS}`; spaced(ctx, 1);
  const tw = ctx.measureText(FM_SITE).width;
  const blockW = Math.max(size, tw);
  const cx = align === "right" ? x - blockW / 2 : x;
  if (assets.logo) {
    ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.drawImage(assets.logo, cx - size / 2, yBottom - 17 - gap - size, size, size);
    ctx.shadowColor = "transparent";
  }
  ctx.fillStyle = color; ctx.globalAlpha = 0.9; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(FM_SITE, cx, yBottom);
  ctx.restore();
}

function textBlock(ctx, { title, date }, opt) {
  const { x, y, maxW, align = "left", nameFont, nameSize, nameColor, dateColor, dateSize = 26, dateGap = 14, upper = false } = opt;
  ctx.save();
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  const name = upper ? title.toUpperCase() : title;
  const s = fitText(ctx, name, nameFont, nameSize, maxW);
  ctx.fillStyle = nameColor; spaced(ctx, upper ? 2 : 0);
  ctx.fillText(name, x, y);
  if (date) {
    ctx.font = `600 ${dateSize}px ${SANS}`; spaced(ctx, 6);
    ctx.fillStyle = dateColor;
    ctx.fillText(date.toUpperCase(), x, y + dateSize + dateGap);
  }
  ctx.restore();
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function draw(ctx, photo, cfg, assets) {
  const s = cfg.style;
  if (s === "keepsake") {
    ctx.fillStyle = "#fbf8f3"; ctx.fillRect(0, 0, W, H);
    const pad = 36, foot = 196;
    cover(ctx, photo, pad, pad, W - pad * 2, H - pad - foot);
    textBlock(ctx, cfg, { x: pad + 8, y: H - foot + 104, maxW: W - pad * 2 - 200, nameFont: `italic 500 {s}px ${SERIF}`, nameSize: 70, nameColor: "#2a2230", dateColor: "#8a7d6c" });
    drawBrand(ctx, cfg, assets, W - pad - 8, H - 58, "#2a2230");
  } else if (s === "gold") {
    cover(ctx, photo, 0, 0, W, H);
    const g = ctx.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.74)");
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.55, W, H * 0.45);
    ctx.strokeStyle = "rgba(232,203,140,.95)"; ctx.lineWidth = 4; ctx.strokeRect(32, 32, W - 64, H - 64);
    textBlock(ctx, cfg, { x: 72, y: H - 128, maxW: W - 340, nameFont: `600 {s}px ${SERIF}`, nameSize: 66, nameColor: "#ffffff", dateColor: "#e8cb8c", dateSize: 24 });
    drawBrand(ctx, cfg, assets, W - 72, H - 76, "#e8cb8c");
  } else if (s === "arch") {
    ctx.fillStyle = "#f6e7ea"; ctx.fillRect(0, 0, W, H);
    const x = W * 0.09, y = H * 0.06, w = W * 0.82, h = H * 0.72, r = w / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h - 14);
    ctx.arcTo(x + w, y + h, x + w - 14, y + h, 14); ctx.lineTo(x + 14, y + h); ctx.arcTo(x, y + h, x, y + h - 14, 14); ctx.closePath();
    ctx.clip(); cover(ctx, photo, x, y, w, h); ctx.restore();
    textBlock(ctx, cfg, { x: W / 2, y: H - 150, maxW: W - 160, align: "center", nameFont: `italic 500 {s}px ${SERIF}`, nameSize: 80, nameColor: "#5a2b3c", dateColor: "#5a2b3c", dateSize: 24 });
    drawBrand(ctx, cfg, assets, W - 36, 116, "#5a2b3c");
  } else if (s === "party") {
    const top = 92, bot = 140, pink = "#ec4899";
    cover(ctx, photo, 0, top, W, H - top - bot);
    ctx.fillStyle = pink; ctx.fillRect(0, 0, W, top); ctx.fillRect(0, H - bot, W, bot);
    ctx.save(); ctx.fillStyle = "#fff"; ctx.font = `400 32px ${DISPLAY}`; spaced(ctx, 5); ctx.textBaseline = "middle";
    ctx.fillText("CELEBRATE", 44, top / 2 + 2); ctx.restore();
    textBlock(ctx, cfg, { x: 44, y: H - bot + 76, maxW: W - 320, nameFont: `400 {s}px ${DISPLAY}`, nameSize: 58, nameColor: "#ffffff", dateColor: "rgba(255,255,255,.9)", dateSize: 20, dateGap: 10, upper: true });
    drawBrand(ctx, cfg, assets, W - 44, H - 26, "#ffffff");
  } else { // sponsor
    cover(ctx, photo, 0, 0, W, H);
    const band = 136;
    ctx.fillStyle = "rgba(255,255,255,.93)"; ctx.fillRect(0, H - band, W, band);
    textBlock(ctx, cfg, { x: 36, y: H - band + 70, maxW: W - 300, nameFont: `600 {s}px ${SERIF}`, nameSize: 46, nameColor: "#16294c", dateColor: "#5d6a85", dateSize: 20, dateGap: 10 });
    drawBrand(ctx, cfg, assets, W - 36, H - 26, "#16294c");
    if (assets.partner) {
      const ph = 74, pw = Math.min(260, ph * (assets.partner.width / assets.partner.height));
      ctx.fillStyle = "rgba(255,255,255,.92)"; roundRect(ctx, W - 28 - pw - 24, 28, pw + 24, ph + 20, 14); ctx.fill();
      ctx.drawImage(assets.partner, W - 28 - pw - 12, 38, pw, ph);
    }
  }
}

// Draw the framed photo. Rejects only if the photo itself can't be loaded or
// the browser refuses to export the canvas.
export async function renderFramed(photoUrl, cfg) {
  const [photo, logo, partner] = await Promise.all([
    loadImage(photoUrl),
    cfg.logo === "fm" ? loadImage(FM_LOGO_URL) : Promise.resolve(null),
    cfg.style === "sponsor" && cfg.partnerUrl ? loadImage(cfg.partnerUrl) : Promise.resolve(null),
    fontsReady(),
  ]);
  if (!photo) throw new Error("photo-load");
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  draw(ctx, photo, cfg, { logo, partner });
  return await new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export"))), "image/jpeg", 0.9); }
    catch (e) { reject(e); }
  });
}
