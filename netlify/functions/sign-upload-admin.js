// HALO — presigned PUT URLs for ADMIN uploads (hero carousel images, event music).
// App-global admin only. The server chooses the path prefix ("hero/" / "covers/" /
// "music/") so the client can only upload into those folders.
// Auth: per-user session (profiles.is_admin) OR the transitional admin passcode.
import { presignPut } from "./_r2.js";
import { authenticate } from "./_auth.js";

const KINDS = {
  hero:  { prefix: "hero",  ext: "jpg", ct: "image/jpeg" },
  cover: { prefix: "covers", ext: "jpg", ct: "image/jpeg" }, // per-event cover photo
  music: { prefix: "music", ext: null,  ct: "audio/mpeg" }, // ext from filename
  site:  { prefix: "site",  ext: null,  ct: "image/jpeg" }, // swappable landing photos; ext from filename
};

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { kind, filename, contentType } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!auth.isAdmin) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }
  const spec = KINDS[kind];
  if (!spec) return { statusCode: 400, body: JSON.stringify({ error: "kind must be hero, cover, music or site" }) };

  const rnd = Math.random().toString(36).slice(2, 7);
  let ext = spec.ext;
  if (!ext) ext = (String(filename || "").split(".").pop() || "mp3").toLowerCase();
  const path = `${spec.prefix}/${Date.now()}-${rnd}.${ext}`;
  const ct = contentType || spec.ct;

  try {
    const uploadUrl = await presignPut(path, ct);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadUrl, path, contentType: ct }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not sign upload: " + e.message }) };
  }
}
