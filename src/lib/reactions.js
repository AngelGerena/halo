import { supabase } from "./supabase.js";

const DEV_KEY = "halo_device";
export const KINDS = ["heart", "like"];

// Stable anonymous per-device id so one phone counts as one reaction of each kind per photo.
export function getDeviceId() {
  let d = null;
  try { d = localStorage.getItem(DEV_KEY); } catch {}
  if (!d) {
    d = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(DEV_KEY, d); } catch {}
  }
  return d;
}

export const rxKey = (photoId, kind) => `${photoId}:${kind}`;

// Returns {
//   counts: {photoId: total},                       // hearts + likes
//   kinds:  {photoId: {heart: n, like: n}},
//   liked:  Set("photoId:kind") this device has already sent
// }
export async function fetchReactions(photoIds) {
  const out = { counts: {}, kinds: {}, liked: new Set() };
  if (!photoIds || photoIds.length === 0) return out;
  const dev = getDeviceId();
  const { data } = await supabase.from("reactions").select("photo_id,device_id,kind").in("photo_id", photoIds);
  (data || []).forEach((r) => {
    const kind = r.kind || "heart";
    out.counts[r.photo_id] = (out.counts[r.photo_id] || 0) + 1;
    out.kinds[r.photo_id] = out.kinds[r.photo_id] || { heart: 0, like: 0 };
    out.kinds[r.photo_id][kind] = (out.kinds[r.photo_id][kind] || 0) + 1;
    if (r.device_id === dev) out.liked.add(rxKey(r.photo_id, kind));
  });
  return out;
}

// Send a reaction. Idempotent per device + kind (unique constraint -> 23505 is ignored).
export async function like(photoId, eventId, kind = "heart") {
  const device_id = getDeviceId();
  const { error } = await supabase.from("reactions").insert({ photo_id: photoId, event_id: eventId, device_id, kind });
  if (error && error.code !== "23505") throw error;
  return true;
}
