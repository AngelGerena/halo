// HALO: show the host's free-text event date in the guest's language.
// event_date is typed by the host (e.g. "October 31, 2026"). On the Spanish
// guest page we re-render it as "31 de octubre de 2026" when, and only when,
// it is clearly a full English month-name date. Anything else (a Spanish date
// the host typed, "Saturday night", "Oct 31 - Nov 1") is shown exactly as typed.

const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun";
// Optional weekday, then "October 31, 2026" / "Oct. 31st 2026".
const FULL_DATE = new RegExp(`^(?:(${WEEKDAYS})\\.?,?\\s+)?(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, "i");

export function formatEventDate(text, lang) {
  if (text == null) return "";
  const s = String(text).trim();
  if (lang !== "es" || !s) return s;
  const m = s.match(FULL_DATE);
  if (!m) return s;
  const [, weekday, month, day, year] = m;
  const ms = Date.parse(`${month.replace(/^sept$/i, "sep")} ${day}, ${year}`);
  if (Number.isNaN(ms)) return s;
  const d = new Date(ms);
  // Guard against roll-over like "February 31" silently becoming March 3.
  if (d.getDate() !== Number(day)) return s;
  // If the host typed a weekday that doesn't match the date, don't "correct" it.
  if (weekday && !"sunday monday tuesday wednesday thursday friday saturday".split(" ")[d.getDay()].startsWith(weekday.toLowerCase().slice(0, 3))) return s;
  try {
    const opts = { day: "numeric", month: "long", year: "numeric" };
    if (weekday) opts.weekday = "long";
    return new Intl.DateTimeFormat("es", opts).format(d);
  } catch {
    return s;
  }
}
