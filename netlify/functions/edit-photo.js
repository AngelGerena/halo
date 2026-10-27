// HALO Phase 3 — Auto-edit (Sharp corrections)
// Pulls the original from storage, applies automatic exposure / white-balance /
// contrast / sharpening corrections, writes an edited copy, and records its path.
// Originals are never touched — admin chooses which to use.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { getObjectBuffer, putObject } from "./_r2.js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}
  const { photoId, contributorId } = body;

  if (!photoId) return { statusCode: 400, body: JSON.stringify({ error: "photoId required" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. find the photo row
  const { data: photo, error: pErr } = await supabase
    .from("photos").select("*").eq("id", photoId).single();
  if (pErr || !photo) return { statusCode: 404, body: JSON.stringify({ error: "Photo not found" }) };

  // 2. authorize. Two legitimate callers:
  //    a) A GUEST who just uploaded this photo. Guests have no account, so they
  //       prove ownership by presenting the photo's own contributor_id (only the
  //       uploading browser holds it). This is the auto-enhance-on-upload path.
  //    b) An admin / the event owner (per-user session or passcode).
  //    The guest path is scoped to exactly one photo they uploaded; it cannot
  //    be used to touch anyone else's photos.
  const isUploader = !!contributorId && contributorId === photo.contributor_id;
  if (!isUploader) {
    const auth = await authenticate(event);
    if (!auth.ok) {
      return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
    }
    if (!(await ownsEventOrAdmin(supabase, photo.event_id, auth))) {
      return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };
    }
  }

  if (photo.edited_path) {
    return { statusCode: 200, body: JSON.stringify({ edited_path: photo.edited_path, skipped: true }) };
  }

  // 2. download the original from R2
  let inputBuffer;
  try {
    inputBuffer = await getObjectBuffer(photo.storage_path);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Could not read original: " + e.message }) };
  }

  // 3. apply corrections
  let outBuffer;
  try {
    outBuffer = await autoCorrect(inputBuffer);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Edit failed: " + e.message }) };
  }

  // 4. upload edited copy alongside the original (in R2)
  const editedPath = photo.storage_path.replace(/(\.[a-z0-9]+)?$/i, "") + "_edited.jpg";
  try {
    await putObject(editedPath, outBuffer, "image/jpeg");
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Upload failed: " + e.message }) };
  }

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
  // Normalise the source into a REAL 3-channel sRGB buffer before anything
  // per-channel runs. A grayscale (1-channel) or CMYK source otherwise leaves
  // stats.channels short — g/b undefined — and `.linear([r,g,b])` throws
  // "Band expansion using linear is unsupported". A black-and-white filtered
  // phone photo is enough to trigger it. Materialising to PNG here forces sharp
  // to actually expand the bands; a lazy toColourspace() on the pipeline does
  // not. Alpha is flattened + removed so channel order is always [r, g, b].
  const rgb = await sharp(input)
    .rotate()
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .removeAlpha()
    .toFormat("png")
    .toBuffer();
  const base = sharp(rgb);
  const stats = await base.stats();

  // estimate a white-balance correction from per-channel means
  const ch = stats.channels || [];
  const r = ch[0], g = ch[1] || ch[0], b = ch[2] || ch[0];
  if (!r) throw new Error("Could not read image channels");
  const avg = (r.mean + g.mean + b.mean) / 3;
  // Keep correction gentle, and never let a degenerate image (tiny, flat, or
  // corrupt — stats can come back NaN/0) poison the gains: anything non-finite
  // falls back to neutral 1.0 instead of crashing sharp with NaN.
  const clamp = (v) => (Number.isFinite(v) ? Math.max(0.85, Math.min(1.15, v)) : 1.0);
  const rGain = clamp(avg / (r.mean || avg));
  const gGain = clamp(avg / (g.mean || avg));
  const bGain = clamp(avg / (b.mean || avg));

  // brightness lift only when the image is dark overall
  const luma = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
  const bright = !Number.isFinite(luma) ? 1.0 : luma < 110 ? 1.08 : luma < 90 ? 1.15 : 1.0;

  return base
    .normalize()                                  // auto levels / exposure
    .linear([rGain * bright, gGain * bright, bGain * bright], [0, 0, 0]) // WB + lift per channel
    .modulate({ saturation: 1.08 })               // gentle vibrance
    .sharpen({ sigma: 0.8 })                       // light crispness
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
