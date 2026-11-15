// HALO — highlight videos saved to an event (events.highlights).
//
// POST { action: "save", eventId, path, type, seconds, vertical, music }
//   records a video the browser just uploaded to R2 (highlights/<eventId>/...)
// POST { action: "delete", eventId, id }
//   deletes the video file from R2 and removes it from the list
// The event's owner, a co-host or an admin may do either.
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { deleteObjects } from "./_r2.js";

const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
const MAX_SAVED = 20;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { action, eventId } = b;

  const auth = await authenticate(event);
  if (!auth.ok) return json(401, { error: "Unauthorized" });
  if (!eventId || !/^[A-Za-z0-9-]{1,64}$/.test(String(eventId))) return json(400, { error: "eventId required" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) return json(403, { error: "Forbidden" });

  const { data: ev, error: evErr } = await supabase.from("events").select("highlights").eq("id", eventId).maybeSingle();
  if (evErr) return json(500, { error: evErr.message });
  if (!ev) return json(404, { error: "Event not found" });
  const list = Array.isArray(ev.highlights) ? ev.highlights : [];

  if (action === "save") {
    const path = typeof b.path === "string" ? b.path : "";
    if (!path.startsWith(`highlights/${eventId}/`) || path.includes("..") || path.length > 200) return json(400, { error: "Invalid path" });
    if (list.length >= MAX_SAVED) return json(400, { error: `You can keep up to ${MAX_SAVED} highlight videos. Delete one first.` });
    const item = {
      id: Math.random().toString(36).slice(2, 12),
      path,
      type: b.type === "video/webm" ? "video/webm" : "video/mp4",
      seconds: Math.max(0, Math.min(600, Math.round(Number(b.seconds) || 0))),
      vertical: b.vertical !== false,
      music: typeof b.music === "string" ? b.music.slice(0, 160) : null,
      created_at: new Date().toISOString(),
    };
    const next = [item, ...list];
    const { error } = await supabase.from("events").update({ highlights: next }).eq("id", eventId);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, item, highlights: next });
  }

  if (action === "delete") {
    const item = list.find((h) => h && h.id === b.id);
    if (!item) return json(404, { error: "Video not found" });
    try { await deleteObjects([item.path]); } catch (e) { console.error("R2 remove warning:", e.message); }
    const next = list.filter((h) => h && h.id !== b.id);
    const { error } = await supabase.from("events").update({ highlights: next }).eq("id", eventId);
    if (error) return json(500, { error: error.message });
    return json(200, { ok: true, highlights: next });
  }

  return json(400, { error: "Unknown action" });
}
