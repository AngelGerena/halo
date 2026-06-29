import { supabase } from "./supabase.js";

const DEV_KEY = "halo_device";

// Stable anonymous per-device id so one phone counts as one heart per photo.
export function getDeviceId() {
  let d = null;
  try { d = localStorage.getItem(DEV_KEY); } catch {}
  if (!d) {
    d = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(DEV_KEY, d); } catch {}
  }
  return d;
}

// Returns { counts: {photoId: n}, liked: Set(photoId this device has hearted) }
export async function fetchReactions(photoIds) {
  const out = { counts: {}, liked: new Set() };
  if (!photoIds || photoIds.length === 0) return out;
  const dev = getDeviceId();
  const { data } = await supabase.from("reactions").select("photo_id,device_id").in("photo_id", photoIds);
  (data || []).forEach((r) => {
    out.counts[r.photo_id] = (out.counts[r.photo_id] || 0) + 1;
    if (r.device_id === dev) out.liked.add(r.photo_id);
  });
  return out;
}

// Add a heart. Idempotent per device (unique constraint -> 23505 is ignored).
export async function like(photoId, eventId) {
  const device_id = getDeviceId();
  const { error } = await supabase.from("reactions").insert({ photo_id: photoId, event_id: eventId, device_id });
  if (error && error.code !== "23505") throw error;
  return true;
}
