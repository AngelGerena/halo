// HALO — Smart cover framing.
// The event cover is shown as a short, wide band on phones (and a small square
// thumb). A centre crop beheads portrait photos. This finds where the picture's
// attention is (faces, skin tones, detail — sharp's attention strategy) and
// stores it as a focal point (0..1, 0..1). The UI anchors every crop on it via
// CSS object-position, so heads stay in view at any aspect ratio.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { getObjectBuffer } from "./_r2.js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, coverPath } = body;
  if (!eventId || !coverPath) return { statusCode: 400, body: JSON.stringify({ error: "eventId and coverPath required" }) };

  const auth = await authenticate(event);
  if (!auth.ok) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };

  let buf;
  try { buf = await getObjectBuffer(coverPath); }
  catch (e) { return { statusCode: 500, body: JSON.stringify({ error: "Could not read cover: " + e.message }) }; }

  let fx = 0.5, fy = 0.5;
  try {
    const img = sharp(buf).rotate();
    const meta = await img.metadata();
    const w = meta.width, h = meta.height;
    if (w && h) {
      // Crop to a band shaped like the phone hero (~1.9:1) at full width; sharp
      // reports the attention centre in input-image coordinates.
      const bandH = Math.max(1, Math.min(h, Math.round(w / 1.9)));
      const { info } = await img.resize({ width: w, height: bandH, fit: "cover", position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
      if (Number.isFinite(info.attentionX) && Number.isFinite(info.attentionY)) {
        fx = Math.max(0, Math.min(1, info.attentionX / w));
        fy = Math.max(0, Math.min(1, info.attentionY / h));
      }
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not analyse cover: " + e.message }) };
  }

  const { error } = await supabase.from("events").update({ cover_focus_x: fx, cover_focus_y: fy }).eq("id", eventId);
  if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  return { statusCode: 200, body: JSON.stringify({ cover_focus_x: fx, cover_focus_y: fy }) };
}
