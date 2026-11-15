// Shared 60-day retention rules for the Netlify functions.
// Keep RETAIN_DAYS in step with src/lib/retention.js.
export const RETAIN_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;
// Host reminder emails go out this many days before the gallery closes.
export const NOTICE_DAYS = [30, 7, 1];

const TZ = "America/New_York";

// "Wednesday, December 30, 2026"
export function longDate(d) {
  return new Date(d).toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// Whole days / hours / minutes left until `at` (never negative).
export function timeLeft(at, now = Date.now()) {
  const ms = Math.max(0, new Date(at).getTime() - now);
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return { ms, days, hours, minutes };
}
