// Patches a small whitelist of event settings. Service-role write, gated on a
// per-user session (Supabase JWT) with owner-or-admin verification, plus the
// transitional admin passcode override.
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const ALLOWED = ["featured_photo_id", "look", "challenges", "moderation_mode", "protect_minors", "is_recurring", "current_session", "connect_label", "connect_label_es", "connect_url", "category", "cover_path", "cover_focus_x", "cover_focus_y", "cover_zoom", "music_url", "music_rights_ack", "music_rights_ack_at", "frame_style", "frame_logo", "frame_title", "frame_partner_path", "boomerang_enabled", "video_guestbook_enabled", "filters_enabled", "mosaic_enabled", "lead_capture", "lead_consent_text", "sponsor_name", "leaderboard_minutes", "sponsors", "sponsor_layout", "sponsor_card_minutes", "sponsor_moments", "name", "host", "event_date", "name_es", "host_es", "event_date_es", "cohost_mode"];

// Event details a host can rename after creation (fix a typo, change the title).
// The event code (and so the QR link) never changes, so printed QR codes keep working.
const TEXT_LIMITS = { name: 120, host: 120, event_date: 80, name_es: 120, host_es: 120, event_date_es: 80 };

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, patch } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!eventId || typeof patch !== "object" || patch === null) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId and patch are required" }) };
  }

  const clean = {};
  for (const k of ALLOWED) {
    if (k in patch) clean[k] = patch[k];
  }
  // Reassigning ownership is admin-only. A non-admin owner must never be able
  // to change owner_id (that would let them give away or grab events).
  if ("owner_id" in patch && auth.isAdmin) {
    clean.owner_id = patch.owner_id; // may be a uuid or null (unassign)
  }
  // Gallery close date (60-day retention) can only be moved by an admin.
  if (auth.isAdmin && "expires_at" in patch) {
    const d = patch.expires_at == null ? null : new Date(patch.expires_at);
    if (d && isNaN(d.getTime())) return { statusCode: 400, body: JSON.stringify({ error: "expires_at must be a date" }) };
    clean.expires_at = d ? d.toISOString() : null;
    clean.expiry_notified = {}; // re-send the 30/7/1-day reminders for the new date
  }
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    if (!(k in clean)) continue;
    const v = clean[k];
    if (v !== null && typeof v !== "string") {
      return { statusCode: 400, body: JSON.stringify({ error: `${k} must be text` }) };
    }
    const trimmed = typeof v === "string" ? v.trim().slice(0, max) : "";
    clean[k] = trimmed || null;
  }
  if ("connect_url" in clean && clean.connect_url != null) {
    const raw = String(clean.connect_url).trim().slice(0, 500);
    let ok = "";
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (u.protocol === "https:" || u.protocol === "http:") ok = u.href;
    } catch {}
    if (raw && !ok) return { statusCode: 400, body: JSON.stringify({ error: "Link must be a web address (https://...)" }) };
    clean.connect_url = ok || null;
  }
  if ("name" in clean && !clean.name) {
    return { statusCode: 400, body: JSON.stringify({ error: "Event name is required" }) };
  }
  if ("lead_capture" in clean && !["off", "email", "phone", "both"].includes(clean.lead_capture)) {
    return { statusCode: 400, body: JSON.stringify({ error: "lead_capture must be off, email, phone or both" }) };
  }
  if ("sponsor_layout" in clean && clean.sponsor_layout !== null && !["corner", "ticker", "ribbon", "breaks", "lower", "rail", "split", "marquee"].includes(clean.sponsor_layout)) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unknown sponsor_layout" }) };
  }
  if ("sponsor_card_minutes" in clean && ![0, 5, 10, 20, null].includes(clean.sponsor_card_minutes)) {
    return { statusCode: 400, body: JSON.stringify({ error: "sponsor_card_minutes must be 0, 5, 10 or 20" }) };
  }
  if ("cohost_mode" in clean && !["auto", "album", "tools"].includes(clean.cohost_mode)) {
    return { statusCode: 400, body: JSON.stringify({ error: "cohost_mode must be auto, album or tools" }) };
  }
  if ("sponsor_moments" in clean) clean.sponsor_moments = clean.sponsor_moments === true;
  if ("sponsors" in clean) {
    // Rebuild the list from known fields only. Logos must be files uploaded
    // for this event (covers/<eventId>/...), never an outside URL.
    const raw = Array.isArray(clean.sponsors) ? clean.sponsors : null;
    if (!raw || raw.length > 24) return { statusCode: 400, body: JSON.stringify({ error: "sponsors must be a list of up to 24" }) };
    const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const out = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const logo = typeof x.logo_path === "string" ? x.logo_path : null;
      if (logo && (!logo.startsWith(`covers/${eventId}/`) || logo.includes("..") || logo.length > 200)) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid sponsor logo" }) };
      }
      const name = str(x.name, 80);
      if (!name && !logo) continue;
      out.push({
        id: str(x.id, 40) || Math.random().toString(36).slice(2, 10),
        name,
        tier: ["presenting", "gold", "community"].includes(x.tier) ? x.tier : "gold",
        logo_path: logo,
        message: str(x.message, 160),
        moment: ["spot", "board", "mosaic", "messages"].includes(x.moment) ? x.moment : null,
      });
    }
    clean.sponsors = out;
  }
  if ("leaderboard_minutes" in clean && ![0, 5, 10, 20, null].includes(clean.leaderboard_minutes)) {
    return { statusCode: 400, body: JSON.stringify({ error: "leaderboard_minutes must be 0, 5, 10 or 20" }) };
  }
  if (Object.keys(clean).length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "No updatable fields supplied" }) };
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }
  // Only the owner decides what co-hosts get after the event.
  if ("cohost_mode" in clean && !(await ownsEventOrAdmin(supabase, eventId, auth, { allowCohost: false }))) {
    return { statusCode: 403, body: JSON.stringify({ error: "Only the event owner can change this" }) };
  }

  const { data, error } = await supabase.from("events").update(clean).eq("id", eventId).select().single();
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

  return { statusCode: 200, body: JSON.stringify({ ok: true, event: data }) };
}
