// HALO V2 Phase 3b — Auto-crop. Generates attention-cropped social variants
// (1:1, 4:5, 9:16, 16:9) from the corrected (or original) image and records
// their storage paths. Service-role; idempotent (re-uses existing crops).
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const RATIOS = { "1x1": [1080, 1080], "4x5": [1080, 1350], "9x16": [1080, 1920], "16x9": [1920, 1080] };

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, photoId } = body;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!photoId) return { statusCode: 400, body: JSON.stringify({ error: "photoId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: photo, error: pErr } = await supabase.from("photos").select("*").eq("id", photoId).single();
  if (pErr || !photo) return { statusCode: 404, body: JSON.stringify({ error: "Photo not found" }) };
  if (photo.crops && Object.keys(photo.crops).length >= 4) {
    return { statusCode: 200, body: JSON.stringify({ crops: photo.crops, skipped: true }) };
  }

  const source = photo.edited_path || photo.storage_path;
  const { data: file, error: dErr } = await supabase.storage.from("halo").download(source);
  if (dErr || !file) return { statusCode: 500, body: JSON.stringify({ error: "Could not read source image" }) };
  const input = Buffer.from(await file.arrayBuffer());

  const base = photo.storage_path.replace(/(\.[a-z0-9]+)?$/i, "");
  const crops = {};
  try {
    for (const [key, [w, h]] of Object.entries(RATIOS)) {
      const out = await sharp(input).rotate()
        .resize(w, h, { fit: "cover", position: sharp.strategy.attention })
        .jpeg({ quality: 92, mozjpeg: true }).toBuffer();
      const path = `${base}_crop_${key}.jpg`;
      const upErr = (await supabase.storage.from("halo").upload(path, out, { contentType: "image/jpeg", upsert: true })).error;
      if (upErr) throw new Error(upErr.message);
      crops[key] = path;
    }
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Crop failed: " + e.message }) };
  }

  const { error: uErr } = await supabase.from("photos").update({ crops }).eq("id", photoId);
  if (uErr) return { statusCode: 500, body: JSON.stringify({ error: "DB update failed: " + uErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ crops }) };
}
