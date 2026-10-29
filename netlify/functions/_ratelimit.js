// HALO — best-effort, in-memory rate limiting for Netlify functions.
//
// Each warm function instance keeps its own Map, so this is not a global
// guarantee (a cold start or a second instance starts fresh). It is still a
// real speed bump: it turns "unlimited guesses per second" into a handful per
// window per instance, which is what we need against passcode brute force and
// email-trigger abuse. Nothing here ever throws.

const buckets = new Map(); // "bucket|ip" -> [timestamps]
const MAX_KEYS = 5000;     // keep memory bounded on a long-lived instance

// Caller IP as Netlify reports it. x-nf-client-connection-ip is set by
// Netlify's edge and is the most trustworthy; x-forwarded-for is the fallback.
export function clientIp(event) {
  const h = (event && event.headers) || {};
  const nf = h["x-nf-client-connection-ip"] || h["X-Nf-Client-Connection-Ip"];
  if (nf) return String(nf).trim();
  const xff = h["x-forwarded-for"] || h["X-Forwarded-For"];
  if (xff) return String(xff).split(",")[0].trim();
  return "unknown";
}

function recent(key, windowMs) {
  const now = Date.now();
  const list = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (list.length) buckets.set(key, list); else buckets.delete(key);
  return list;
}

// How many hits this ip has in the bucket within the window.
export function hitCount(bucket, ip, windowMs) {
  try { return recent(`${bucket}|${ip}`, windowMs).length; } catch { return 0; }
}

// Record one hit for this ip in the bucket.
export function addHit(bucket, ip, windowMs) {
  try {
    const key = `${bucket}|${ip}`;
    const list = recent(key, windowMs);
    list.push(Date.now());
    buckets.set(key, list);
    if (buckets.size > MAX_KEYS) {
      // Drop the oldest keys (Map keeps insertion order).
      const drop = buckets.size - MAX_KEYS;
      let i = 0;
      for (const k of buckets.keys()) { if (i++ >= drop) break; buckets.delete(k); }
    }
  } catch { /* best-effort */ }
}

export function clearHits(bucket, ip) {
  try { buckets.delete(`${bucket}|${ip}`); } catch { /* best-effort */ }
}

// Count-every-call limiter: returns true (and does NOT record) when the ip is
// already at the limit; otherwise records the hit and returns false.
export function overLimit(bucket, ip, limit, windowMs) {
  if (hitCount(bucket, ip, windowMs) >= limit) return true;
  addHit(bucket, ip, windowMs);
  return false;
}

export const tooMany = (msg = "Too many attempts. Please wait a few minutes and try again.") => ({
  statusCode: 429,
  headers: { "Content-Type": "application/json", "Retry-After": "600" },
  body: JSON.stringify({ error: msg }),
});
