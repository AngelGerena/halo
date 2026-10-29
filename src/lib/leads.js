// HALO — lead capture helpers (corporate events / galas).
// events.lead_capture is "off" | "email" | "phone" | "both". Anything else
// (or a missing column) counts as "off", so events keep working as before.

export const LEAD_MODES = ["off", "email", "phone", "both"];

export function leadMode(event) {
  const m = event && event.lead_capture;
  return LEAD_MODES.includes(m) ? m : "off";
}

export const wantsPhone = (mode) => mode === "phone" || mode === "both";

// Same checks the server makes (rename-contributor.js).
export function validEmail(s) {
  const v = String(s || "").trim();
  return !v || (v.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
}
export function cleanPhone(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  const plus = v.startsWith("+");
  const digits = v.replace(/[^\d]/g, "");
  return (plus ? "+" : "") + digits;
}
export function validPhone(s) {
  const v = String(s || "").trim();
  if (!v) return true;
  if (!/^\+?[\d\s().-]+$/.test(v)) return false;
  const n = v.replace(/[^\d]/g, "").length;
  return n >= 7 && n <= 15;
}

// The consent line a guest sees. Host's own text wins; otherwise a default
// naming the sponsor (or the event).
export function consentText(event, t, eventName) {
  const own = String((event && event.lead_consent_text) || "").trim();
  if (own) return own;
  const who = String((event && event.sponsor_name) || "").trim() || eventName || "";
  return t("leadcap.consentDefault").replace("{name}", who);
}

// ---- CSV (host export) ----
// Cells starting with = + - @ could run as formulas in Excel/Sheets. A clean
// phone number ("+15551234567") is safe and stays as is.
function cell(v) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{7,15}$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function formatJoined(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function leadsCsv(rows, t) {
  const head = [t("leadcap.col.name"), t("leadcap.col.email"), t("leadcap.col.phone"), t("leadcap.col.marketing"), t("leadcap.col.joined")];
  const lines = [head.map(cell).join(",")];
  (rows || []).forEach((r) => {
    lines.push([r.name, r.email, r.phone, r.marketing_ok ? t("leadcap.yes") : t("leadcap.no"), formatJoined(r.created_at)].map(cell).join(","));
  });
  return "\uFEFF" + lines.join("\r\n") + "\r\n"; // BOM so Excel reads accents
}

// Extra fields for rename-contributor when lead capture is on. Returns
// { body: {} } when off (request stays exactly as before), { error: key }
// when a typed value is not valid.
export function leadExtras(event, { email, phone, consent }) {
  const mode = leadMode(event);
  if (mode === "off") return { body: {} };
  if (!validEmail(email)) return { error: "leadcap.badEmail" };
  const p = wantsPhone(mode) ? String(phone || "").trim() : "";
  if (!validPhone(p)) return { error: "leadcap.badPhone" };
  const hasContact = !!(String(email || "").trim() || p);
  return { body: { phone: p ? cleanPhone(p) : null, marketing_ok: !!consent && hasContact } };
}
