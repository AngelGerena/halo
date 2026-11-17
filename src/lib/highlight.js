import { corsUrl } from "./corsUrl.js";
// HALO — highlight video, made right in the host's browser.
//
// Picks the best-loved photos (hearts + likes first, then HALO's quality
// score), puts them back in the order they were taken, and plays them as a
// ~60 second film: a title card, each photo with a slow push-in and a soft
// cross-fade, a closing card, and the event's music underneath. The canvas
// is recorded in real time with MediaRecorder, so it takes about as long as
// the video itself when it has to record live (see encodeFrames for the
// preferred frame-by-frame path). MP4 where the browser can record it (Chrome, Safari),
// otherwise WebM.

const FPS = 30;
const INTRO = 3.2, OUTRO = 3.6, PER = 2.7, FADE = 0.7;

export function pickHighlights(photos, counts = {}, max = 20) {
  const pool = photos.filter((p) => p.status !== "pending" && p.status !== "hidden" && !p.video_url && (p.kept !== false)
    && (!p.kind || p.kind === "photo")); // boomerang sprites / messages are not stills
  const ranked = pool.slice().sort((a, b) =>
    ((counts[b.id] || 0) - (counts[a.id] || 0)) || ((b.quality || 0) - (a.quality || 0)));
  const chosen = ranked.slice(0, max);
  return chosen.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function recorderType() {
  const opts = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  if (typeof MediaRecorder === "undefined") return null;
  return opts.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } }) || null;
}

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // photos live on R2; CORS keeps the canvas recordable
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = corsUrl(url);
  });
}

const ease = (t) => t * t * (3 - 2 * t);


// ---- Pre-rendering -----------------------------------------------------
// Everything expensive (resizing a 4000px original, blurs, drop shadows) is
// done ONCE per photo before recording starts. Each video frame is then a
// single quick copy of a frame-sized canvas, so the recorder never drops
// frames and the finished video plays back smooth.
const BASE = 1.1; // prepared canvases are 10% larger than the frame, for the slow push-in

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext("2d"); x.imageSmoothingQuality = "high";
  return [c, x];
}

// Downscale in halves first: one giant drawImage step looks soft and is slow.
function shrink(img, targetW, targetH) {
  let src = img, w = img.width, h = img.height;
  while (w / 2 > targetW && h / 2 > targetH) {
    const [c, x] = makeCanvas(w / 2, h / 2);
    x.drawImage(src, 0, 0, c.width, c.height);
    src = c; w = c.width; h = c.height;
  }
  return src;
}

// One frame-shaped canvas per photo, at BASE zoom, with the photo already
// framed (cover crop, or centered over its own blurred copy when the shape
// doesn't match the video). Drawn per frame by drawPrepared().
function preparePhoto(img, W, H, i) {
  const PW = W * BASE, PH = H * BASE;
  const [c, x] = makeCanvas(PW, PH);
  const frameTall = H > W, imgTall = img.height > img.width;
  const fits = frameTall === imgTall || Math.abs(img.width / img.height - W / H) < 0.35;
  const cover = Math.max(PW / img.width, PH / img.height);
  const src = shrink(img, img.width * cover, img.height * cover);
  if (fits) {
    const w = img.width * cover, h = img.height * cover;
    x.drawImage(src, (PW - w) * (i % 2 ? 0.45 : 0.55), (PH - h) * 0.42, w, h);
  } else {
    // blurred, darkened backdrop (blur a small copy: same look, far cheaper)
    const [b, bx] = makeCanvas(PW / 4, PH / 4);
    const bs = Math.max(b.width / img.width, b.height / img.height) * 1.15;
    bx.drawImage(src, (b.width - img.width * bs) / 2, (b.height - img.height * bs) / 2, img.width * bs, img.height * bs);
    if ("filter" in x) x.filter = "blur(7px) brightness(.55)";
    x.drawImage(b, -PW * 0.02, -PH * 0.02, PW * 1.04, PH * 1.04);
    x.filter = "none";
    if (!("filter" in x)) { x.fillStyle = "rgba(0,0,0,.45)"; x.fillRect(0, 0, PW, PH); }
    const fs = Math.min(PW / img.width, PH / img.height) * 0.94;
    const fw = img.width * fs, fh = img.height * fs;
    x.save(); x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 44;
    x.drawImage(shrink(img, fw, fh), (PW - fw) / 2, (PH - fh) / 2, fw, fh);
    x.restore();
  }
  return c;
}

// Blurred backdrop for the title / closing cards, made once.
function prepareBackdrop(img, W, H) {
  const [b, bx] = makeCanvas(W / 4, H / 4);
  const s = Math.max(b.width / img.width, b.height / img.height) * 1.2;
  bx.drawImage(shrink(img, img.width * s, img.height * s), (b.width - img.width * s) / 2, (b.height - img.height * s) / 2, img.width * s, img.height * s);
  const [c, x] = makeCanvas(W, H);
  if ("filter" in x) x.filter = "blur(8px) brightness(.4)";
  x.drawImage(b, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
  x.filter = "none";
  x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, 0, W, H);
  return c;
}

// The push-in: zoom goes 1.02 -> 1.09 over each photo.
function drawPrepared(ctx, prep, W, H, k, i) {
  const z = 1.02 + 0.07 * k;
  const w = W * z, h = H * z;
  ctx.drawImage(prep, (W - w) * (i % 2 ? 0.45 : 0.55), (H - h) * 0.42, w, h);
}

function wrapText(ctx, text, maxW) {
  const words = String(text || "").split(/\s+/); const lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCard(ctx, W, H, { eyebrow, title, sub, gold, bg }, alpha, bgImg) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (bgImg) {
    ctx.drawImage(bgImg, 0, 0, W, H); // pre-blurred backdrop (prepareBackdrop)
  } else { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
  const u = Math.min(W, H) / 100;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillStyle = gold;
  ctx.font = `700 ${2.6 * u}px Inter, Arial, sans-serif`;
  if (eyebrow) ctx.fillText(eyebrow.toUpperCase().split("").join(String.fromCharCode(8202)), W / 2, H / 2 - 13 * u);
  ctx.fillStyle = "#ffffff";
  ctx.font = `italic 600 ${9 * u}px Georgia, 'Times New Roman', serif`;
  const lines = wrapText(ctx, title, W * 0.84).slice(0, 3);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * 10 * u));
  if (sub) {
    ctx.fillStyle = "rgba(255,255,255,.82)";
    ctx.font = `500 ${3.2 * u}px Inter, Arial, sans-serif`;
    ctx.fillText(sub, W / 2, H / 2 + (lines.length / 2) * 10 * u + 7 * u);
  }
  ctx.fillStyle = gold;
  ctx.fillRect(W / 2 - 6 * u, H / 2 + (lines.length / 2) * 10 * u + (sub ? 13 : 5) * u, 12 * u, 0.4 * u);
  ctx.restore();
}

function prepareWatermark(W, H, text) {
  const u = Math.min(W, H) / 100;
  const [c, x] = makeCanvas(W * 0.4, 8 * u);
  x.font = `700 ${2.2 * u}px Inter, Arial, sans-serif`;
  x.textAlign = "right"; x.textBaseline = "bottom";
  x.fillStyle = "rgba(255,255,255,.7)";
  x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 8;
  x.fillText(text, c.width - 3 * u, c.height - 3 * u);
  return c;
}

/**
 * Make the highlight video.
 * opts: { photos:[{url}], title, subtitle, outroTitle, outroSub, eyebrow,
 *         musicUrl, vertical, gold, bg, watermark, onProgress(sec,total), signal,
 *         audioCtx (from unlockAudio(), made inside the tap) }
 * Resolves { blob, type, seconds, musicMissing }.
 */
export async function makeHighlight(opts) {
  const { photos, title, subtitle, outroTitle, outroSub, eyebrow, musicUrl, vertical = true,
    gold = "#ffb86b", bg = "#0a0410", watermark = "HALO", onProgress = () => {}, signal, audioCtx: unlockedCtx = null } = opts;
  const canEncode = typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
  const type = recorderType();
  if (!canEncode && !type) throw new Error("unsupported");

  const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
  const imgs = (await Promise.all(photos.map((p) => loadImage(p.url)))).filter(Boolean);
  if (imgs.length < 3) throw new Error("few-photos");
  const total = INTRO + imgs.length * PER + OUTRO;

  // Music: mixed ahead of time (looped to length, faded in and out), so
  // nothing has to play out loud while the video is made. Phones block
  // sound that starts long after the tap, which is what left videos silent.
  let pcm = null, musicMissing = false;
  if (musicUrl) {
    try { pcm = await renderMusic(musicUrl, total); }
    catch (e) { musicMissing = true; console.warn("HALO highlight: music could not be loaded:", e && e.message); }
  }

  // Prepare every photo once (see preparePhoto), yielding between photos so
  // the page stays responsive.
  const preps = [];
  for (let i = 0; i < imgs.length; i++) {
    if (signal && signal.aborted) throw new Error("cancelled");
    preps.push(preparePhoto(imgs[i], W, H, i));
    await new Promise((r) => setTimeout(r, 0));
  }
  const introBg = prepareBackdrop(imgs[0], W, H);
  const outroBg = prepareBackdrop(imgs[imgs.length - 1], W, H);
  const wm = prepareWatermark(W, H, watermark);

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingQuality = "medium"; // per-frame copies are near 1:1, so medium looks the same and is faster

  const frame = (t) => drawFrame(t);
  function drawFrame(t) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const pt = t - INTRO;
    if (pt > -FADE && pt < imgs.length * PER + FADE) {
      const i = Math.max(0, Math.min(imgs.length - 1, Math.floor(pt / PER)));
      const local = pt - i * PER;
      drawPrepared(ctx, preps[i], W, H, ease(Math.max(0, Math.min(1, (local + FADE) / (PER + FADE)))), i);
      if (local > PER - FADE && i + 1 < preps.length) {
        ctx.save(); ctx.globalAlpha = ease((local - (PER - FADE)) / FADE);
        drawPrepared(ctx, preps[i + 1], W, H, 0, i + 1);
        ctx.restore();
      }
      ctx.drawImage(wm, W - wm.width, H - wm.height);
    }
    // intro card (fades out into the first photo)
    if (t < INTRO + FADE) {
      const a = t < INTRO - FADE ? 1 : Math.max(0, 1 - (t - (INTRO - FADE)) / (FADE * 2));
      drawCard(ctx, W, H, { eyebrow, title, sub: subtitle, gold, bg }, Math.min(1, t < 0.6 ? t / 0.6 : 1) * a, introBg);
    }
    // outro card (fades in over the last photo)
    const outStart = INTRO + imgs.length * PER - FADE;
    if (t > outStart) {
      const a = Math.min(1, (t - outStart) / (FADE * 1.5));
      drawCard(ctx, W, H, { eyebrow: "", title: outroTitle, sub: outroSub, gold, bg }, a, outroBg);
    }
  }

  // Preferred: build the video frame by frame (WebCodecs). Every frame lands
  // in the file no matter how busy the phone is, so playback is perfectly
  // smooth, and it usually finishes faster than real time. Falls back to
  // live recording below if this browser can't.
  if (canEncode) {
    try {
      const out = await encodeFrames({ W, H, total, vertical, pcm, drawFrame, canvas, onProgress, signal });
      try { unlockedCtx && unlockedCtx.close().catch(() => {}); } catch {}
      return { ...out, musicMissing };
    } catch (e) {
      if (e && e.message === "cancelled") throw e;
      console.warn("HALO highlight: frame encoder unavailable, recording live instead:", e && e.message);
      if (!type) {
        // No live recorder either: still make the video, just without music.
        if (pcm) {
          const out = await encodeFrames({ W, H, total, vertical, pcm: null, drawFrame, canvas, onProgress, signal });
          try { unlockedCtx && unlockedCtx.close().catch(() => {}); } catch {}
          return { ...out, musicMissing: true };
        }
        throw new Error("unsupported");
      }
    }
  }

  const stream = canvas.captureStream(FPS);
  // Music: the pre-mixed track goes straight into the recording through
  // WebAudio (nothing plays out loud). The context was unlocked by the tap.
  let audioCtx = null, music = null;
  if (pcm) {
    try {
      audioCtx = unlockedCtx || new (window.AudioContext || window.webkitAudioContext)();
      try { await audioCtx.resume(); } catch {}
      const dest = audioCtx.createMediaStreamDestination();
      music = audioCtx.createBufferSource(); music.buffer = pcm;
      music.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch (e) { console.warn("HALO highlight: music not recorded:", e && e.message); music = null; musicMissing = true; }
  }

  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: vertical ? 9_000_000 : 10_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  frame(0);
  rec.start(1000);
  if (music) { try { music.start(0); } catch { /* recorded without music */ } }

  const t0 = performance.now();
  await new Promise((resolve, reject) => {
    let lastSec = -1;
    const tick = () => {
      if (signal && signal.aborted) { reject(new Error("cancelled")); return; }
      const t = (performance.now() - t0) / 1000;
      if (t >= total) { frame(total); resolve(); return; }
      frame(t);
      const sec = Math.floor(t);
      if (sec !== lastSec) { lastSec = sec; onProgress(sec, Math.ceil(total)); }
      // Draw in step with the screen (smooth, steady frame timing). If the tab
      // is hidden, animation frames pause, so fall back to a timer.
      if (document.visibilityState === "visible") requestAnimationFrame(tick);
      else setTimeout(tick, 1000 / FPS);
    };
    tick();
  }).finally(() => {
    try { rec.state !== "inactive" && rec.stop(); } catch {}
    try { music && music.stop(); } catch {}
    try { audioCtx && audioCtx.close().catch(() => {}); } catch {}
    stream.getTracks().forEach((t) => t.stop());
  });
  await stopped;
  const mime = type.split(";")[0];
  return { blob: new Blob(chunks, { type: mime }), type: mime, seconds: Math.round(total), musicMissing };
}

// Call this first thing in the tap handler (before any await), and pass the
// result as opts.audioCtx. Phones (iPhone above all) only let sound start
// from inside a tap; this opens the audio while the tap still counts.
export function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    try { c.resume(); } catch {}
    const b = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource(); src.buffer = b; src.connect(c.destination); src.start(0);
    return c;
  } catch { return null; }
}


// ---- Frame-by-frame encoder (WebCodecs + MP4) ------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SR = 48000;

// Music mixed offline: looped to the video's length, faded in over 1.5 s and
// out over the last 2.5 s (same as the live recorder).
async function renderMusic(url, total) {
  let res;
  try { res = await fetch(url, { mode: "cors" }); } catch { res = null; }
  // Safari can hold a non-CORS copy of the track (the music preview played
  // it); a slightly different URL gets a clean CORS copy.
  if (!res || !res.ok) res = await fetch(corsUrl(url), { mode: "cors" });
  if (!res.ok) throw new Error("music " + res.status);
  const bytes = await res.arrayBuffer();
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const octx = new OAC(2, Math.ceil(total * SR), SR);
  const buf = await new Promise((ok, bad) => { const p = octx.decodeAudioData(bytes, ok, bad); if (p && p.then) p.then(ok, bad); });
  const src = octx.createBufferSource(); src.buffer = buf; src.loop = true;
  const g = octx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(0.9, 1.5);
  g.gain.setValueAtTime(0.9, Math.max(1.5, total - 2.5));
  g.gain.linearRampToValueAtTime(0, total);
  src.connect(g); g.connect(octx.destination);
  src.start(0);
  return octx.startRendering();
}

async function pickConfig(Enc, list) {
  for (const c of list) {
    try { const r = await Enc.isConfigSupported(c); if (r && r.supported) return r.config || c; } catch {}
  }
  return null;
}

async function encodeFrames({ W, H, total, vertical, pcm, drawFrame, canvas, onProgress, signal }) {
  const vcfg = await pickConfig(VideoEncoder, ["avc1.640028", "avc1.4d0028", "avc1.42E028", "avc1.640033"].map((codec) => ({
    codec, width: W, height: H, bitrate: vertical ? 6_500_000 : 7_500_000, bitrateMode: "variable", framerate: FPS, avc: { format: "avc" },
  })));
  if (!vcfg) throw new Error("no-h264-encoder");

  // With music, this path needs an AAC encoder (most phones don't have one);
  // otherwise the live recorder below adds the same pre-mixed track.
  let acfg = null;
  if (pcm) {
    if (typeof AudioEncoder === "undefined" || typeof AudioData === "undefined") throw new Error("no-audio-encoder");
    acfg = await pickConfig(AudioEncoder, [{ codec: "mp4a.40.2", sampleRate: SR, numberOfChannels: 2, bitrate: 160_000 }]);
    if (!acfg) throw new Error("no-aac-encoder");
  }

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: W, height: H, frameRate: FPS },
    audio: pcm ? { codec: "aac", numberOfChannels: 2, sampleRate: SR } : undefined,
    fastStart: "in-memory", // index at the front: starts playing instantly when streamed
    firstTimestampBehavior: "offset",
  });

  let failure = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
  venc.configure(vcfg);

  const n = Math.ceil(total * FPS);
  const dt = 1e6 / FPS;
  let lastSec = -1;
  for (let f = 0; f <= n; f++) {
    if (signal && signal.aborted) { try { venc.close(); } catch {} throw new Error("cancelled"); }
    if (failure) throw failure;
    drawFrame(Math.min(total, f / FPS));
    const vf = new VideoFrame(canvas, { timestamp: Math.round(f * dt), duration: Math.round(dt) });
    venc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
    vf.close();
    while (venc.encodeQueueSize > 4) await sleep(4); // backpressure: keep memory flat
    if (f % 6 === 0) await sleep(0);                  // let the page breathe
    const sec = Math.floor(f / FPS);
    if (sec !== lastSec) { lastSec = sec; onProgress(sec, Math.ceil(total)); }
  }
  await venc.flush();
  venc.close();
  if (failure) throw failure;

  if (pcm) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    aenc.configure(acfg);
    const L = pcm.getChannelData(0), R = pcm.numberOfChannels > 1 ? pcm.getChannelData(1) : L;
    const STEP = 1024;
    for (let i = 0; i < pcm.length; i += STEP) {
      const len = Math.min(STEP, pcm.length - i);
      const planar = new Float32Array(len * 2);
      planar.set(L.subarray(i, i + len), 0);
      planar.set(R.subarray(i, i + len), len);
      const ad = new AudioData({ format: "f32-planar", sampleRate: SR, numberOfFrames: len, numberOfChannels: 2, timestamp: Math.round((i / SR) * 1e6), data: planar });
      aenc.encode(ad); ad.close();
      if (aenc.encodeQueueSize > 32) await sleep(1);
    }
    await aenc.flush();
    aenc.close();
    if (failure) throw failure;
  }

  muxer.finalize();
  onProgress(Math.ceil(total), Math.ceil(total));
  return { blob: new Blob([target.buffer], { type: "video/mp4" }), type: "video/mp4", seconds: Math.round(total) };
}
