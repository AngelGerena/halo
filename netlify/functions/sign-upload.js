// HALO — issues short-lived presigned PUT URLs so a guest's browser can upload
// a photo directly to R2 without the secret ever reaching the client.
//
// Public endpoint (no passcode) — guests use it — but it is NOT a blank cheque:
//  - it validates that the event + contributor exist and belong together, so a
//    caller can only obtain URLs that write inside a real event/contributor folder
//  - the server builds the final object key; the client never chooses the path
//  - only image/* and short video/* clip uploads are signed here (hero/music use their own admin paths)
//  - when the client sends the file size (`size`, or `sizes` for a batch), the
//    size is checked against a hard limit and baked into the signature, so R2
//    rejects any PUT whose byte count differs. Requests without a size still
//    work (older cached pages) but are capped to a smaller batch.
//
// Returns: { uploadUrl, path }  — the client PUTs the raw file bytes to uploadUrl
// with the same Content-Type, then records `path` as storage_path in the DB.
import { createClient } from "@supabase/supabase-js";
import { presignPut } from "./_r2.js";

const MAX_BATCH = 20; // per-request cap for burst uploads
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;  // 25 MB per photo
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB per clip (the app caps clips at 150 MB)
const mb = (n) => Math.round(n / (1024 * 1024));

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
  const { eventId, contributorId, count, contentType, size, sizes } = b;

  if (!eventId || !contributorId) {
    return { statusCode: 400, body: JSON.stringify({ error: "eventId and contributorId required" }) };
  }
  const raw = contentType ? String(contentType).toLowerCase() : "";
  const ct = raw.startsWith("image/") ? raw : (VIDEO_EXT[raw] ? raw : (raw.startsWith("video/") ? "video/mp4" : "image/jpeg"));
  const isVideo = ct.startsWith("video/");
  const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

  // Sizes: `sizes` (one per file) wins; else a single `size` applies to every
  // URL in this request; else none (legacy client, unsigned length).
  let lengths = null;
  if (Array.isArray(sizes) && sizes.length) lengths = sizes;
  else if (size != null) lengths = new Array(Math.max(1, parseInt(count, 10) || 1)).fill(size);
  if (lengths) {
    if (lengths.length > MAX_BATCH) {
      return { statusCode: 400, body: JSON.stringify({ error: `Too many files in one request (max ${MAX_BATCH}).` }) };
    }
    for (const v of lengths) {
      const bytes = Number(v);
      if (!Number.isInteger(bytes) || bytes <= 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid file size." }) };
      }
      if (bytes > limit) {
        return {
          statusCode: 413,
          body: JSON.stringify({ error: `File is too large (${mb(bytes)} MB). The limit is ${mb(limit)} MB per ${isVideo ? "video" : "photo"}.` }),
        };
      }
    }
    lengths = lengths.map(Number);
  }
  const n = lengths ? lengths.length : Math.max(1, Math.min(MAX_BATCH, parseInt(count, 10) || 1));

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
      const uploadUrl = await presignPut(path, ct, 300, lengths ? lengths[i] : undefined);
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
