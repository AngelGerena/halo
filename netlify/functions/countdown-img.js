// Live countdown tile for the "your gallery closes soon" emails.
//
//   GET /.netlify/functions/countdown-img?e=<event id>&u=d|h|m
//
// Returns a PNG of one number (days, hours or minutes left until the event's
// gallery closes). Email apps can't run code, so the "live" part comes from
// the image being drawn fresh each time the email is opened (no caching).
// Digits are drawn as shapes (seven-segment style), not text, so no fonts are
// needed on the server and it looks identical everywhere.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { timeLeft } from "./_retention.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Brand: ink #1C2640, gold #C5A44B (matches the HALO email template).
const BG = "#1C2640", ON = "#C5A44B", OFF = "rgba(197,164,75,0.07)";
const W = 192, H = 128;          // drawn at 2x for sharp retina display (shown 96x64)
const DW = 44, DH = 80, T = 11;  // digit width, height, stroke thickness
const GAP = 14;

// Which segments light up for each digit: a b c d e f g
const SEGS = {
  0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
  5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

function digitSvg(n, x, y) {
  const on = SEGS[n] || "";
  const half = DH / 2;
  const h = T / 2 + 1;            // inset so the rounded ends meet cleanly
  const vlen = half - T / 2 - 2;  // vertical segment length
  const hlen = DW - T - 2;        // horizontal segment length
  const seg = {
    a: [x + h, y, hlen, T],
    b: [x + DW - T, y + h, T, vlen],
    c: [x + DW - T, y + half + 1, T, vlen],
    d: [x + h, y + DH - T, hlen, T],
    e: [x, y + half + 1, T, vlen],
    f: [x, y + h, T, vlen],
    g: [x + h, y + half - T / 2, hlen, T],
  };
  return Object.entries(seg).map(([k, [sx, sy, sw, sh]]) =>
    `<rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="${T / 2}" fill="${on.includes(k) ? ON : OFF}"/>`
  ).join("");
}

export function tileSvg(value) {
  const digits = String(Math.max(0, Math.min(999, value | 0))).padStart(2, "0").split("").map(Number);
  const total = digits.length * DW + (digits.length - 1) * GAP;
  let x = (W - total) / 2;
  const y = (H - DH) / 2;
  const body = digits.map((d) => { const s = digitSvg(d, x, y); x += DW + GAP; return s; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" rx="24" fill="${BG}"/>
  <rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="21" fill="none" stroke="${ON}" stroke-opacity="0.35" stroke-width="2"/>
  ${body}
</svg>`;
}

export async function handler(event) {
  const q = event.queryStringParameters || {};
  const id = String(q.e || "");
  const unit = ["d", "h", "m"].includes(q.u) ? q.u : "d";

  let value = 0;
  if (UUID.test(id)) {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase.from("events").select("expires_at,closed_at").eq("id", id).maybeSingle();
      if (data && data.expires_at && !data.closed_at) {
        const left = timeLeft(data.expires_at);
        value = unit === "d" ? left.days : unit === "h" ? left.hours : left.minutes;
      }
    } catch { /* draw zeros rather than a broken image */ }
  }

  const png = await sharp(Buffer.from(tileSvg(value))).png().toBuffer();
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
    body: png.toString("base64"),
    isBase64Encoded: true,
  };
}
