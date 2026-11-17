// HALO: the post-event Album (see _album.js).
//
//   GET  ?k=<album key>        -> public, no login. { event, photos, until }
//                                 every kept + approved photo, oldest first.
//   POST { eventId } (signed in as owner, co-host or admin)
//                              -> { key, url } the private album link to share.
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { albumKey, albumUrl, readAlbumKey } from "./_album.js";
import { RETAIN_DAYS, DAY_MS } from "./_retention.js";

const json = (statusCode, body, extra = {}) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  body: JSON.stringify(body),
});

// Only what the album page needs. No owner, code, sponsors or settings.
const EVENT_FIELDS = ["name", "name_es", "host", "host_es", "event_date", "event_date_es", "cover_path", "cover_focus_x", "cover_focus_y",
  "frame_style", "frame_title", "frame_logo", "frame_partner_path", "is_recurring"];
const PHOTO_FIELDS = ["id", "storage_path", "edited_path", "video_path", "kind", "loop_frames", "duration", "created_at"];
const pick = (row, fields) => Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, row[f]]));

export async function handler(event) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (event.httpMethod === "POST") {
    let b = {};
    try { b = JSON.parse(event.body || "{}"); } catch {}
    const auth = await authenticate(event);
    if (!auth.ok) return json(401, { error: "Unauthorized" });
    if (!b.eventId) return json(400, { error: "eventId required" });
    if (!(await ownsEventOrAdmin(supabase, b.eventId, auth))) return json(403, { error: "Forbidden" });
    try { return json(200, { key: albumKey(b.eventId), url: albumUrl(b.eventId) }); }
    catch { return json(400, { error: "Bad event id" }); }
  }

  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  const eventId = readAlbumKey((event.queryStringParameters || {}).k);
  if (!eventId) return json(404, { error: "not_found" });

  const { data: ev, error } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  if (error) return json(500, { error: "load_failed" });
  if (!ev) return json(404, { error: "not_found" });
  if (ev.closed_at) return json(410, { error: "closed" });

  let q = supabase.from("photos").select(PHOTO_FIELDS.join(","))
    .eq("event_id", eventId).eq("kept", true).eq("status", "approved");
  if (ev.current_session) q = q.eq("session_label", ev.current_session);
  const { data: rows, error: e2 } = await q.order("created_at", { ascending: true }).limit(2000);
  if (e2) return json(500, { error: "load_failed" });

  // Video guestbook messages have their own place; the album is the photos.
  const photos = (rows || []).filter((p) => (p.kind || "photo") !== "message").map((p) => pick(p, PHOTO_FIELDS));

  let until = null;
  if (!ev.is_recurring) {
    if (ev.expires_at) until = ev.expires_at;
    else if (photos.length) until = new Date(new Date(photos[0].created_at).getTime() + RETAIN_DAYS * DAY_MS).toISOString();
  }
  return json(200, { event: pick(ev, EVENT_FIELDS), photos, until });
}
