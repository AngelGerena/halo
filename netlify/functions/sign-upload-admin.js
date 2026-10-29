// HALO — presigned PUT URLs for host/admin uploads (hero carousel images,
// per-event cover photos and music, landing-site photos). The server chooses the
// path prefix ("hero/" / "covers/<eventId>/" / "music/<eventId>/" / "site/") so
// the client can only upload into those folders.
// Auth:
//   - hero / site: app-global admin only (profiles.is_admin or the passcode).
//   - cover / music: the event's owner, a co-host, or an admin. The client must
//     send eventId; ownership is verified server-side with ownsEventOrAdmin.
import { createClient } from "@supabase/supabase-js";
import { presignPut } from "./_r2.js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const KINDS = {
  hero:  { prefix: "hero",   ext: "jpg", ct: "image/jpeg", perEvent: false },
  cover: { prefix: "covers", ext: "jpg", ct: "image/jpeg", perEvent: true }, // per-event cover photo
  music: { prefix: "music",  ext: null,  ct: "audio/mpeg", perEvent: true }, // ext from filename
  site:  { prefix: "site",   ext: null,  ct: "image/jpeg", perEvent: false }, // swappable landing photos; ext from filename
};

// Event ids are uuids; keep the path segment strictly safe either way.
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
// Only short alphanumeric extensions (never let a filename inject path bits).
function safeExt(filename, fallback) {
  const ext = (String(filename || "").split(".").pop() || "").toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { kind, filename, contentType, eventId } = b;

  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const spec = KINDS[kind];
  if (!spec) return { statusCode: 400, body: JSON.stringify({ error: "kind must be hero, cover, music or site" }) };

  let prefix = spec.prefix;
  if (spec.perEvent) {
    // Admins keep working without an eventId (legacy flat path); everyone else
    // must name an event they own or co-host.
    if (eventId) {
      if (!SAFE_ID.test(String(eventId))) {
        return { statusCode: 400, body: JSON.stringify({ error: "Invalid eventId" }) };
      }
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      if (!(await ownsEventOrAdmin(supabase, eventId, auth))) {
        return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
      }
      prefix = `${spec.prefix}/${eventId}`;
    } else if (!auth.isAdmin) {
      return { statusCode: 400, body: JSON.stringify({ error: "eventId is required" }) };
    }
  } else if (!auth.isAdmin) {
    return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
  }

  const rnd = Math.random().toString(36).slice(2, 7);
  const ext = spec.ext || safeExt(filename, kind === "music" ? "mp3" : "jpg");
  const path = `${prefix}/${Date.now()}-${rnd}.${ext}`;
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
