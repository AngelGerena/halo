// HALO — short video clips from guests.
//
// probeClip(file) reads the clip in the browser (nothing is uploaded yet) and
// returns its length, size and a still frame to use as its thumbnail. The
// still frame becomes the row's storage_path, so every place HALO already
// shows a photo shows the clip's frame without any extra work.
//
// If the browser can't decode the clip (for example an iPhone HEVC .mov in an
// older desktop browser) we still accept it and draw a simple branded
// placeholder frame instead.

export const MAX_CLIP_SECONDS = 20;          // longer than this: ask the guest to trim
export const WALL_SECONDS = 15;              // the live wall plays at most this much
export const MAX_CLIP_BYTES = 150 * 1024 * 1024;

export const isVideoFile = (f) => !!f && (String(f.type).startsWith("video/") || /\.(mov|mp4|m4v|webm|3gp)$/i.test(f.name || ""));

function canvasToJpeg(canvas) {
  return new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.85));
}

async function placeholderPoster() {
  const c = document.createElement("canvas");
  c.width = 1280; c.height = 720;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 1280, 720);
  grad.addColorStop(0, "#1a1020"); grad.addColorStop(1, "#0a0410");
  g.fillStyle = grad; g.fillRect(0, 0, 1280, 720);
  g.fillStyle = "rgba(255,184,107,.92)";
  g.beginPath(); g.arc(640, 360, 90, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#0a0410";
  g.beginPath(); g.moveTo(612, 310); g.lineTo(612, 410); g.lineTo(700, 360); g.closePath(); g.fill();
  return canvasToJpeg(c);
}

export async function probeClip(file) {
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
  v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
  const wait = (ev, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    v.addEventListener(ev, () => { clearTimeout(t); res(); }, { once: true });
    v.addEventListener("error", () => { clearTimeout(t); rej(new Error("decode")); }, { once: true });
  });
  try {
    await wait("loadedmetadata", 8000);
    const duration = Number.isFinite(v.duration) ? v.duration : 0;
    const width = v.videoWidth || 0, height = v.videoHeight || 0;
    let poster = null;
    try {
      v.currentTime = Math.min(0.6, Math.max(0, duration / 3));
      await wait("seeked", 6000);
      const scale = Math.min(1, 1600 / Math.max(width, height || 1));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(width * scale)); c.height = Math.max(1, Math.round(height * scale));
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      poster = await canvasToJpeg(c);
    } catch { poster = null; }
    return { duration, width, height, poster: poster || (await placeholderPoster()), decoded: !!poster };
  } catch {
    // Can't read it here; accept it with a placeholder and let the server-side size cap protect us.
    return { duration: 0, width: 0, height: 0, poster: await placeholderPoster(), decoded: false };
  } finally {
    v.removeAttribute("src"); v.load?.();
    URL.revokeObjectURL(url);
  }
}
