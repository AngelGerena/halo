import { corsUrl } from "./corsUrl.js";
// HALO — highlight video, made right in the host's browser.
//
// Picks the best-loved photos (hearts + likes first, then HALO's quality
// score), puts them back in the order they were taken, and plays them as a
// ~60 second film: a title card, each photo with a slow push-in and a soft
// cross-fade, a closing card, and the event's music underneath. The canvas
// is recorded in real time with MediaRecorder, so it takes about as long as
// the video itself. MP4 where the browser can record it (Chrome, Safari),
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

function drawCover(ctx, img, W, H, zoom, fx = 0.5, fy = 0.42) {
  const s = Math.max(W / img.width, H / img.height) * zoom;
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) * fx, (H - h) * fy, w, h);
}

// A photo whose shape doesn't match the frame (a landscape shot in a vertical
// reel, or the other way round) sits whole in the middle over a darkened,
// enlarged copy of itself, instead of being cropped to a sliver.
function drawPhoto(ctx, img, W, H, k, i) {
  const frameTall = H > W, imgTall = img.height > img.width;
  const zoom = 1.02 + 0.07 * k;
  if (frameTall === imgTall || Math.abs(img.width / img.height - W / H) < 0.35) {
    drawCover(ctx, img, W, H, zoom, i % 2 ? 0.45 : 0.55, 0.42);
    return;
  }
  ctx.save();
  if ("filter" in ctx) ctx.filter = "blur(28px) brightness(.55)";
  drawCover(ctx, img, W, H, 1.15);
  ctx.restore();
  if (!("filter" in ctx)) { ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, 0, W, H); }
  const s = Math.min(W / img.width, H / img.height) * 0.94 * zoom;
  const w = img.width * s, h = img.height * s;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.5)"; ctx.shadowBlur = 40;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  ctx.restore();
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
    ctx.save(); if ("filter" in ctx) ctx.filter = "blur(30px) brightness(.4)"; drawCover(ctx, bgImg, W, H, 1.2); ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(0, 0, W, H);
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

function drawWatermark(ctx, W, H, text) {
  const u = Math.min(W, H) / 100;
  ctx.save();
  ctx.font = `700 ${2.2 * u}px Inter, Arial, sans-serif`;
  ctx.textAlign = "right"; ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 8;
  ctx.fillText(text, W - 3 * u, H - 3 * u);
  ctx.restore();
}

/**
 * Make the highlight video.
 * opts: { photos:[{url}], title, subtitle, outroTitle, outroSub, eyebrow,
 *         musicUrl, vertical, gold, bg, watermark, onProgress(sec,total), signal }
 * Resolves { blob, type, seconds }.
 */
export async function makeHighlight(opts) {
  const { photos, title, subtitle, outroTitle, outroSub, eyebrow, musicUrl, vertical = true,
    gold = "#ffb86b", bg = "#0a0410", watermark = "HALO", onProgress = () => {}, signal } = opts;
  const type = recorderType();
  if (!type) throw new Error("unsupported");

  const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
  const imgs = (await Promise.all(photos.map((p) => loadImage(p.url)))).filter(Boolean);
  if (imgs.length < 3) throw new Error("few-photos");
  const total = INTRO + imgs.length * PER + OUTRO;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  const stream = canvas.captureStream(FPS);
  // Music: routed through WebAudio so it records without playing out loud.
  let audioCtx = null, audioEl = null, gain = null;
  if (musicUrl) {
    try {
      audioEl = new Audio(); audioEl.crossOrigin = "anonymous"; audioEl.src = musicUrl; audioEl.loop = true; audioEl.preload = "auto";
      await new Promise((res) => { audioEl.oncanplaythrough = res; audioEl.onerror = res; setTimeout(res, 6000); });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const src = audioCtx.createMediaElementSource(audioEl);
      gain = audioCtx.createGain(); gain.gain.value = 0;
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(gain); gain.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } catch { audioCtx = null; }
  }

  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: vertical ? 9_000_000 : 10_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  const frame = (t) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const pt = t - INTRO;
    // photos
    if (pt > -FADE && pt < imgs.length * PER + FADE) {
      const i = Math.max(0, Math.min(imgs.length - 1, Math.floor(pt / PER)));
      const local = pt - i * PER;
      drawPhoto(ctx, imgs[i], W, H, ease(Math.max(0, Math.min(1, (local + FADE) / (PER + FADE)))), i);
      if (local > PER - FADE && i + 1 < imgs.length) {
        ctx.save(); ctx.globalAlpha = ease((local - (PER - FADE)) / FADE);
        drawPhoto(ctx, imgs[i + 1], W, H, 0, i + 1);
        ctx.restore();
      }
      drawWatermark(ctx, W, H, watermark);
    }
    // intro card (fades out into the first photo)
    if (t < INTRO + FADE) {
      const a = t < INTRO - FADE ? 1 : Math.max(0, 1 - (t - (INTRO - FADE)) / (FADE * 2));
      drawCard(ctx, W, H, { eyebrow, title, sub: subtitle, gold, bg }, Math.min(1, t < 0.6 ? t / 0.6 : 1) * a, imgs[0]);
    }
    // outro card (fades in over the last photo)
    const outStart = INTRO + imgs.length * PER - FADE;
    if (t > outStart) {
      const a = Math.min(1, (t - outStart) / (FADE * 1.5));
      drawCard(ctx, W, H, { eyebrow: "", title: outroTitle, sub: outroSub, gold, bg }, a, imgs[imgs.length - 1]);
    }
  };

  frame(0);
  rec.start(1000);
  if (audioEl && audioCtx) {
    try { await audioCtx.resume(); audioEl.currentTime = 0; await audioEl.play(); } catch {}
    // fade the music in, and out over the last 2.5 s
    const now = audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.9, now + 1.5);
    gain.gain.setValueAtTime(0.9, now + total - 2.5);
    gain.gain.linearRampToValueAtTime(0, now + total);
  }

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
      // setTimeout keeps drawing even if the browser throttles animation frames.
      setTimeout(tick, 1000 / FPS);
    };
    tick();
  }).finally(() => {
    try { rec.state !== "inactive" && rec.stop(); } catch {}
    try { audioEl && audioEl.pause(); } catch {}
    try { audioCtx && audioCtx.close(); } catch {}
    stream.getTracks().forEach((t) => t.stop());
  });
  await stopped;
  const mime = type.split(";")[0];
  return { blob: new Blob(chunks, { type: mime }), type: mime, seconds: Math.round(total) };
}
