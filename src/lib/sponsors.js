// HALO sponsors: one place that reads an event's sponsor list and settings.
//
// events.sponsors is a list of { id, name, tier, logo_path, message, moment }.
// Older events only have one sponsor (sponsor_name + frame_partner_path); that
// sponsor is read as the presenting sponsor so nothing changes for them.
import { publicUrl } from "./supabase.js";

export const TIERS = ["presenting", "gold", "community"];
export const LAYOUTS = ["corner", "ticker", "ribbon", "breaks", "lower", "rail", "split", "marquee"];
export const MOMENTS = ["spot", "board", "mosaic", "messages"];
export const MAX_SPONSORS = 24;

const clean = (s, n) => String(s || "").trim().slice(0, n);

export function sponsorsOf(event) {
  if (!event) return [];
  const raw = Array.isArray(event.sponsors) ? event.sponsors : [];
  let list = raw
    .filter((s) => s && typeof s === "object" && (clean(s.name, 80) || s.logo_path))
    .map((s, i) => ({
      id: String(s.id || "s" + i),
      name: clean(s.name, 80),
      tier: TIERS.includes(s.tier) ? s.tier : "gold",
      logo_path: s.logo_path || null,
      logo: s.logo_path ? publicUrl(s.logo_path) : null,
      message: clean(s.message, 160),
      moment: MOMENTS.includes(s.moment) ? s.moment : null,
    }));
  if (!list.length && event.frame_partner_path) {
    list = [{ id: "legacy", name: clean(event.sponsor_name, 80), tier: "presenting", logo_path: event.frame_partner_path,
      logo: publicUrl(event.frame_partner_path), message: "", moment: null }];
  }
  // Presenting first, then gold, then community; the host's order inside a tier.
  return list.map((s, i) => ({ ...s, _i: i })).sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a._i - b._i);
}

export const presentingOf = (event) => sponsorsOf(event).find((s) => s.tier === "presenting") || null;
export const layoutOf = (event) => (event && LAYOUTS.includes(event.sponsor_layout) ? event.sponsor_layout : "corner");

// Minutes between sponsor cards / breaks: 5, 10 or 20, 0 = off, default 10.
export function cardEveryMs(event) {
  const m = event && event.sponsor_card_minutes;
  if (m === 0) return 0;
  return ([5, 10, 20].includes(m) ? m : 10) * 60000;
}

// The sponsor that owns a wall moment, when Sponsored moments is on.
export function momentSponsor(event, moment) {
  if (!event || !event.sponsor_moments) return null;
  return sponsorsOf(event).find((s) => s.moment === moment) || null;
}
