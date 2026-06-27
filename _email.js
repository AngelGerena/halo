// HALO Phase 3 — Auto-edit (Sharp corrections)
// Pulls the original from storage, applies automatic exposure / white-balance /
// contrast / sharpening corrections, writes an edited copy, and records its path.
// Originals are never touched — admin chooses which to use.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { photoId } = body;
  if (!photoId) return { statusCode: 400, body: JSON.stringify({ error: "photoId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. find the photo row
  const { data: photo, error: pErr } = await supabase
    .from("photos").select("*").eq("id", photoId).single();
  if (pErr || !photo) return { statusCode: 404, body: JSON.stringify({ error: "Photo not found" }) };
  if (photo.edited_path) {
    return { statusCode: 200, body: JSON.stringify({ edited_path: photo.edited_path, skipped: true }) };
  }

  // 2. download the original
  const { data: file, error: dErr } = await supabase.storage.from("halo").download(photo.storage_path);
  if (dErr || !file) return { statusCode: 500, body: JSON.stringify({ error: "Could not read original" }) };
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  // 3. apply corrections
  let outBuffer;
  try {
    outBuffer = await autoCorrect(inputBuffer);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Edit failed: " + e.message }) };
  }

  // 4. upload edited copy alongside the original
  const editedPath = photo.storage_path.replace(/(\.[a-z0-9]+)?$/i, "") + "_edited.jpg";
  const upErr = (await supabase.storage.from("halo").upload(editedPath, outBuffer, {
    contentType: "image/jpeg", upsert: true,
  })).error;
  if (upErr) return { statusCode: 500, body: JSON.stringify({ error: "Upload failed: " + upErr.message }) };

  // 5. record it
  const { error: uErr } = await supabase.from("photos").update({ edited_path: editedPath }).eq("id", photoId);
  if (uErr) return { statusCode: 500, body: JSON.stringify({ error: "DB update failed: " + uErr.message }) };

  return { statusCode: 200, body: JSON.stringify({ edited_path: editedPath }) };
}

// Automatic correction pipeline. Sharp-only, no external services.
// - normalize: stretches contrast to full range (auto exposure/levels)
// - linear: gentle midtone lift so faces aren't muddy
// - modulate: slight saturation lift for life without oversaturating
// - white balance: neutralize a color cast by equalizing channel means
// - sharpen: light unsharp mask
// - rotate(): respects EXIF orientation
async function autoCorrect(input) {
  const base = sharp(input).rotate();
  const meta = await base.metadata();
  const stats = await base.stats();

  // estimate a white-balance correction from per-channel means
  const [r, g, b] = stats.channels;
  const avg = (r.mean + g.mean + b.mean) / 3;
  const clamp = (v) => Math.max(0.85, Math.min(1.15, v)); // keep correction gentle
  const rGain = clamp(avg / (r.mean || avg));
  const gGain = clamp(avg / (g.mean || avg));
  const bGain = clamp(avg / (b.mean || avg));

  // brightness lift only when the image is dark overall
  const luma = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
  const bright = luma < 110 ? 1.08 : luma < 90 ? 1.15 : 1.0;

  return base
    .normalize()                                  // auto levels / exposure
    .linear([rGain * bright, gGain * bright, bGain * bright], [0, 0, 0]) // WB + lift per channel
    .modulate({ saturation: 1.08 })               // gentle vibrance
    .sharpen({ sigma: 0.8 })                       // light crispness
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
