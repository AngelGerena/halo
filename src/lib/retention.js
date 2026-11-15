// 60-day gallery retention, browser side. Keep RETAIN_DAYS in step with
// netlify/functions/_retention.js (the nightly cleanup).
export const RETAIN_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

// When this event's gallery closes, or null if the clock hasn't started
// (no photos yet) or the event is recurring (rolling per-photo deletion).
// Before the nightly job stamps expires_at, it's estimated from the first photo.
export function expiryFor(event, firstPhotoAt) {
  if (!event || event.is_recurring) return null;
  if (event.expires_at) return new Date(event.expires_at);
  if (!firstPhotoAt) return null;
  return new Date(new Date(firstPhotoAt).getTime() + RETAIN_DAYS * DAY_MS);
}

export function splitLeft(target, now = Date.now()) {
  const ms = Math.max(0, new Date(target).getTime() - now);
  return {
    ms,
    days: Math.floor(ms / DAY_MS),
    hours: Math.floor((ms % DAY_MS) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
  };
}

export function formatDate(d, lang) {
  return new Date(d).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function shortDate(d, lang) {
  return new Date(d).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" });
}
