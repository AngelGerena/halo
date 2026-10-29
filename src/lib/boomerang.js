// HALO — boomerangs (short clips that play forward, then backward, on a loop).
//
// How it works, start to finish:
//  1. The guest records a short clip with the phone camera (a plain
//     <input type="file" accept="video/*" capture>, which is the reliable path
//     on iPhone Safari).
//  2. makeBoomerang() reads the first ~2 seconds IN THE BROWSER: it seeks the
//     clip frame by frame, draws BOOM_FRAMES evenly spaced frames (longest side
//     BOOM_MAX_SIDE px) into a grid, and saves that grid as ONE JPEG "sprite
//     sheet". The clip itself is never uploaded, so a boomerang is small.
//  3. uploadBoomerang() sends the sprite through the same signed upload path as
//     every photo (signPhotoUploads with size, then putToR2), so the photos
//     insert trigger is satisfied, and saves a photos row with
//     kind = 'boomerang' and loop_frames = the number of frames.
//  4. <BoomerangPlayer> (components/BoomerangPlayer.jsx) plays the sprite
//     ping-pong style anywhere a photo would show.
import { supabase, publicUrl } from "./supabase.js";
import { signPhotoUploads, putToR2 } from "./r2upload.js";
import { classifyQuick } from "./nsfw.js";
import { newId } from "./contributors.js";

export const BOOM_FRAMES = 20;    // frames in the sprite sheet
export const BOOM_SPAN = 2;       // seconds of the clip that are used
export const BOOM_MAX_SIDE = 540; // px, longest side of each frame
export const BOOM_FPS = 14;       // playback speed (a bit faster than real life, like a boomerang)

export const isBoomerang = (p) => !!p && p.kind === "boomerang";
export const isBoomerangFile = (f) => !!f && !!f.haloBoomerang;

// Frames are laid out in a near-square grid, left to right, top to bottom.
// The layout is worked out from the frame count alone, so only loop_frames
// needs to be stored.
export function spriteGrid(n) {
  const frames = Math.max(1, n | 0);
  const cols = Math.ceil(Math.sqrt(frames));
  return { frames, cols, rows: Math.ceil(frames / cols) };
}

// Forward then backward without repeating the two end frames:
// 0 1 2 3 2 1 | 0 1 2 3 2 1 ...
export function pingPong(n) {
  const f = Math.max(1, n | 0);
  const seq = [];
  for (let i = 0; i < f; i++) seq.push(i);
  for (let i = f - 2; i > 0; i--) seq.push(i);
  return seq;
}

function toJpeg(canvas, q = 0.82) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q));
}

function waitFor(v, ev, ms) {
  return new Promise((res, rej) => {
    const done = () => { clearTimeout(t); v.removeEventListener(ev, ok); v.removeEventListener("error", bad); };
    const ok = () => { done(); res(); };
    const bad = () => { done(); rej(new Error("decode")); };
    const t = setTimeout(() => { done(); rej(new Error("timeout")); }, ms);
    v.addEventListener(ev, ok);
    v.addEventListener("error", bad);
  });
}

// Turn a recorded clip into a boomerang sprite sheet. Resolves to a JPEG File
// carrying `haloBoomerang = { frames, width, height, poster }` (width/height
// are one frame's size; poster is the first frame, used for the safety check).
// Rejects with err.unreadable when the browser can't decode the clip, or
// err.tooShort when it's under a third of a second.
export async function makeBoomerang(file, { frames = BOOM_FRAMES, span = BOOM_SPAN, maxSide = BOOM_MAX_SIDE } = {}) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto";
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  v.src = url;
  const fail = (flag) => Object.assign(new Error("boomerang " + flag), { [flag]: true });
  try {
    try { await waitFor(v, "loadedmetadata", 10000); } catch { throw fail("unreadable"); }
    let duration = v.duration;
    // Clips recorded in some browsers report an unknown length until the end
    // has been seen once. Peek at the end to learn it.
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        v.currentTime = 1e6;
        await waitFor(v, "seeked", 5000);
        duration = Number.isFinite(v.duration) ? v.duration : v.currentTime;
      } catch { duration = 0; }
    }
    if (!(duration > 0.3)) throw fail(duration > 0 ? "tooShort" : "unreadable");
    const w = v.videoWidth, h = v.videoHeight;
    if (!w || !h) throw fail("unreadable");

    const use = Math.min(span, duration - 0.05);
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const fw = Math.max(2, Math.round(w * scale)), fh = Math.max(2, Math.round(h * scale));
    const { cols, rows } = spriteGrid(frames);
    const sheet = document.createElement("canvas");
    sheet.width = cols * fw; sheet.height = rows * fh;
    const g = sheet.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, sheet.width, sheet.height);

    let good = 0;
    for (let i = 0; i < frames; i++) {
      const at = 0.02 + (use * i) / frames;
      try {
        v.currentTime = at;
        await waitFor(v, "seeked", 5000);
        good++;
      } catch { /* keep whatever frame the video is on; better than a gap */ }
      g.drawImage(v, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
    }
    if (good < Math.min(4, frames)) throw fail("unreadable");

    const first = document.createElement("canvas");
    first.width = fw; first.height = fh;
    first.getContext("2d").drawImage(sheet, 0, 0, fw, fh, 0, 0, fw, fh);
    const [blob, poster] = await Promise.all([toJpeg(sheet, 0.8), toJpeg(first, 0.85)]);
    const out = new File([blob], "boomerang.jpg", { type: "image/jpeg" });
    out.haloBoomerang = { frames, width: fw, height: fh, poster };
    return out;
  } finally {
    v.removeAttribute("src"); try { v.load(); } catch { /* ignore */ }
    URL.revokeObjectURL(url);
  }
}

// Send a sprite made by makeBoomerang() and save its photos row. Same rules as
// a normal photo: signed upload with size, client-made id (a retry after a
// lost reply can't save it twice), held for the host when the event reviews
// uploads, when kids are in frame, or when the safety check flags it.
// `retry`, `timed` and `sig` are EventPage's own helpers (weak-signal safe).
export async function uploadBoomerang({ file, event, who, kids = false, challengeId = null, onProgress = null, retry, timed, sig }) {
  const meta = file.haloBoomerang || {};
  // Same moderation rule as EventPage uploadOne / uploadClip.
  const needsReview = event.moderation_mode === "review" || (event.protect_minors && kids);
  let flagged = false;
  if (meta.poster) {
    try { flagged = (await classifyQuick(new File([meta.poster], "frame.jpg", { type: "image/jpeg" }))).flagged; } catch { /* never blocks */ }
  }
  const status = (needsReview || flagged) ? "pending" : "approved";
  const path = await retry(async () => {
    const [s] = await signPhotoUploads({ eventId: event.id, contributorId: who.id, count: 1, contentType: "image/jpeg", size: file.size });
    await putToR2(s.uploadUrl, file, s.contentType || "image/jpeg", onProgress);
    return s.path;
  });
  const rowIn = {
    id: newId(),
    event_id: event.id,
    contributor_id: who.id,
    storage_path: path,
    kind: "boomerang",
    loop_frames: meta.frames || BOOM_FRAMES,
    quality: null, // not a still photo: never picked as a cover or ranked against photos
    kept: true,
    width: meta.width || null, height: meta.height || null,
    has_minors: kids,
    status,
    session_label: event.current_session || null,
    auto_flagged: flagged,
    tags: kids ? ["kids"] : [],
    ...(challengeId ? { challenge: challengeId } : {}),
  };
  const row = await retry(async () => {
    const { data, error } = await timed((signal) => sig(supabase.from("photos").insert(rowIn).select(), signal).single());
    if (error && error.code === "23505") return { ...rowIn }; // already saved by an earlier try
    if (error) throw error;
    return data;
  });
  return { ...row, url: publicUrl(path) };
}

// ---- Saving a boomerang to the phone ----
function recorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  const opts = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return opts.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || null;
}

// Loads the sprite so a canvas can be recorded (needs CORS; R2 allows it).
export function loadSprite(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("load"));
    img.src = src;
  });
}

// Make a saveable file from a boomerang. Where the browser can record a
// canvas (iPhone Safari 14.5+, Chrome, Firefox) this is a short video of the
// loop playing a few times (MP4 or WebM). Otherwise it falls back to the
// first frame as a JPEG. Resolves to a File.
export async function exportBoomerang(src, frames, { fps = BOOM_FPS, loops = 3, name = "HALO_boomerang" } = {}) {
  const img = await loadSprite(src);
  const { cols, rows } = spriteGrid(frames);
  const fw = Math.floor(img.naturalWidth / cols), fh = Math.floor(img.naturalHeight / rows);
  const c = document.createElement("canvas");
  c.width = fw - (fw % 2); c.height = fh - (fh % 2); // encoders want even sizes
  const g = c.getContext("2d");
  const draw = (i) => g.drawImage(img, (i % cols) * fw, Math.floor(i / cols) * fh, c.width, c.height, 0, 0, c.width, c.height);
  draw(0);
  const type = recorderType();
  if (type && typeof c.captureStream === "function") {
    try {
      const stream = c.captureStream(fps);
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(250);
      const seq = [];
      for (let k = 0; k < loops; k++) seq.push(...pingPong(frames));
      seq.push(0);
      for (const i of seq) { draw(i); await new Promise((r) => setTimeout(r, 1000 / fps)); }
      rec.stop();
      await stopped;
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: type.split(";")[0] });
      if (blob.size > 0) {
        const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
        return new File([blob], `${name}.${ext}`, { type: blob.type });
      }
    } catch { /* fall through to a still */ }
  }
  draw(0);
  const still = await toJpeg(c, 0.9);
  return new File([still], `${name}.jpg`, { type: "image/jpeg" });
}

// Hand the file to the phone: the share sheet (Save Video / Save Image) where
// supported, else a normal download. Must run inside a tap.
export async function saveFile(file) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return "shared";
    }
  } catch (e) {
    if (e && e.name === "AbortError") return "cancelled";
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}
