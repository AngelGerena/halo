// HALO: the post-event Album.
//
// The album is a simple, view-only page (/album/<key>) for co-hosts, family
// and anyone they send it to. No account, no login. The key is a signed token
// made from the event id, so the link can't be guessed or built from the
// event code, and there is no new table or secret to set up (it is signed
// with a key derived from the service-role key, like the co-host invites).
//
// isOver() decides when a co-host stops getting the host tools and gets the
// album instead. The host can force it either way with events.cohost_mode.
import { createHmac, timingSafeEqual } from "node:crypto";
import { siteBase } from "./_email.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hmac() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Server not configured");
  return createHmac("sha256", secret).update("halo-album-v1").digest();
}
const sig = (idHex) => createHmac("sha256", hmac()).update(idHex).digest().subarray(0, 12);

// event id (uuid) -> 38-char URL-safe key
export function albumKey(eventId) {
  if (!UUID_RE.test(String(eventId || ""))) throw new Error("Bad event id");
  const hex = String(eventId).replace(/-/g, "").toLowerCase();
  return Buffer.from(hex, "hex").toString("base64url") + sig(hex).toString("base64url");
}

// key -> event id, or null when the key is malformed or forged
export function readAlbumKey(key) {
  try {
    if (typeof key !== "string" || key.length !== 38 || !/^[A-Za-z0-9_-]+$/.test(key)) return null;
    const idBuf = Buffer.from(key.slice(0, 22), "base64url");
    const given = Buffer.from(key.slice(22), "base64url");
    if (idBuf.length !== 16 || given.length !== 12) return null;
    const hex = idBuf.toString("hex");
    if (!timingSafeEqual(given, sig(hex))) return null;
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

export const albumUrl = (eventId) => `${siteBase()}/album/${albumKey(eventId)}`;

// ---- "is the event over?" ----------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const TZ = "America/New_York";

// Today's date where HALO's hosts are, as "YYYY-MM-DD".
export function todayKey(now = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}
const key = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const valid = (y, m, d) => {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

// event_date is free text the host typed ("October 31, 2026",
// "Sat, Oct 31 - Nov 1, 2026", "10/31/2026", "31 de octubre de 2026").
// Returns the LAST day it names as "YYYY-MM-DD", or null when it can't tell.
export function lastEventDay(text) {
  const s = String(text || "").toLowerCase();
  if (!s.trim()) return null;
  const years = s.match(/\b(20\d\d)\b/g);
  const fallbackYear = years ? Number(years[years.length - 1]) : null;
  const found = [];
  let m;
  // 2026-10-31
  const iso = /\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/g;
  while ((m = iso.exec(s))) found.push([m.index, +m[1], +m[2], +m[3]]);
  // 10/31/2026 or 10-31-2026 (US order)
  const us = /\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d\d)\b/g;
  while ((m = us.exec(s))) found.push([m.index, +m[3], +m[1], +m[2]]);
  // October 31(, 2026)
  const en = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(20\d\d))?/g;
  while ((m = en.exec(s))) found.push([m.index, m[3] ? +m[3] : fallbackYear, MONTHS.indexOf(m[1].slice(0, 3)) + 1, +m[2]]);
  // 31 de octubre (de 2026)
  const es = /\b(\d{1,2})\s+de\s+(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sept?(?:iembre)?|setiembre|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b\.?(?:\s+(?:de\s+)?(20\d\d))?/g;
  while ((m = es.exec(s))) found.push([m.index, m[3] ? +m[3] : fallbackYear, (m[2] === "setiembre" ? 9 : MONTHS_ES.indexOf(m[2].slice(0, 3)) + 1), +m[1]]);
  const ok = found.filter(([, y, mo, d]) => y && valid(y, mo, d)).sort((a, b) => a[0] - b[0]);
  if (!ok.length) return null;
  const [, y, mo, d] = ok[ok.length - 1];
  return key(y, mo, d);
}

export const COHOST_MODES = ["auto", "album", "tools"];
const LIVE_MS = 6 * 3600 * 1000; // photos in the last 6 hours = still going

// ev: events row. lastPhotoAt: ISO time of the newest photo, or null.
// true -> co-hosts get the album instead of the host tools.
export function isOver(ev, lastPhotoAt, now = Date.now()) {
  const mode = COHOST_MODES.includes(ev?.cohost_mode) ? ev.cohost_mode : "auto";
  if (mode === "album") return true;
  if (mode === "tools") return false;
  if (ev?.closed_at) return true;
  if (lastPhotoAt && now - new Date(lastPhotoAt).getTime() < LIVE_MS) return false;
  const day = lastEventDay(ev?.event_date) || lastEventDay(ev?.event_date_es);
  if (day) return todayKey(now) > day; // the day after the event
  return !!ev?.wrap_sent_at;           // no readable date: after the morning-after email
}
