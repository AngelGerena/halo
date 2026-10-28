// HALO — issues short-lived presigned PUT URLs so a guest's browser can upload
// a photo directly to R2 without the secret ever reaching the client.
//
// Public endpoint (no passcode) — guests use it — but it is NOT a blank cheque:
//  - it validates that the event + contributor exist and belong together, so a
//    caller can only obtain URLs that write inside a real event/contributor folder
//  - the server builds the final object key; the client never chooses the path
//  - only image/* and short video/* clip uploads are signed here (hero/music use their own admin paths)
//
// Returns: { uploadUrl, path }  — the client PUTs the raw file bytes to uploadUrl
// with the same Content-Type, then records `path` as storage_path in the DB.
import { createClient } from "@supabase/supabase-js";
import { presignPut } from "./_r2.js";

const MAX_BATCH = 40; // a reasonable per-request cap for burst uploads

const VIDEO_EXT = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/3gpp": "3gp", "video/x-m4v": "m4v" };

function keyFor(eventId, contributorId, ct) {
  const rnd = Math.random().toString(36).slice(2, 7);
  const ext = ct.startsWith("video/") ? (VIDEO_EXT[ct] || "mp4") : "jpg";
  return `${eventId}/${contributorId}/${Date.now()}-${rnd}.${ext}`;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, contributorId, count, contentType } = b;

  if (!eventId || !contributorId) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId and contributorId required" }) };
  }
  const n = Math.max(1, Math.min(MAX_BATCH, parseInt(count, 10) || 1));
  const raw = contentType ? String(contentType).toLowerCase() : "";
  const ct = raw.startsWith("image/") ? raw : (VIDEO_EXT[raw] ? raw : (raw.startsWith("video/") ? "video/mp4" : "image/jpeg"));

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // verify the contributor belongs to the event (prevents writing into arbitrary folders)
  const { data: contrib, error: cErr } = await supabase
    .from("contributors").select("id, event_id").eq("id", contributorId).single();
  if (cErr || !contrib || contrib.event_id !== eventId) {
    return { statusCode: 403, body: JSON.stringify({ error: "Unknown or mismatched contributor" }) };
  }

  try {
    const items = [];
    for (let i = 0; i < n; i++) {
      const path = keyFor(eventId, contributorId, ct);
      const uploadUrl = await presignPut(path, ct);
      items.push({ uploadUrl, path });
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, contentType: ct }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not sign upload: " + e.message }) };
  }
}
