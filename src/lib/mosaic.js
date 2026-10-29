// Photo mosaic: one big picture (the event's cover photo) rebuilt out of the
// guests' own photos. Everything is drawn on a single canvas.
//
// How it works
// - Each guest photo is shrunk once to a small square thumbnail and its
//   average color is measured. Thumbnails are cached by photo id for the
//   whole page, and made one or two at a time in idle moments so the live
//   wall never stutters.
// - The target picture is cut into a grid. Each cell's average color is
//   matched to the closest guest photo (photos repeat, spread out), and the
//   tile is drawn as that photo tinted toward the cell color, so from across
//   the room you see the big picture and up close you see the guests' shots.
// - Cells fill in as photos arrive (about PER_PHOTO cells per photo). Empty
//   cells show the target faintly, so the room watches it complete.

export const PER_PHOTO = 10;       // cells each guest photo fills
export const MAX_THUMBS = 400;     // most photos sampled into the mosaic
const THUMB = 64;                  // thumbnail edge, px
const TINT = 0.5;                  // how strongly a tile leans to its cell color

const thumbs = new Map();          // photo id -> { img, rgb } | null (failed)
const queued = new Set();
let queue = [];
let running = 0;
const listeners = new Set();

const idle = (fn) => (typeof window !== "undefined" && window.requestIdleCallback)
  ? window.requestIdleCallback(fn, { timeout: 900 })
  : setTimeout(fn, 60);

// Kept + approved photos the wall already has; never video guestbook
// messages or boomerang sprite sheets.
export function mosaicPhotos(list) {
  return (list || []).filter((p) => p && p.id && p.url && (!p.kind || p.kind === "photo"));
}

export function onThumbs(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(); } catch { /* listener gone */ } }); }

export function readyThumbs(list) {
  const out = [];
  for (const p of list) { const t = thumbs.get(p.id); if (t) out.push({ id: p.id, ...t }); }
  return out;
}

// Queue thumbnails for these photos (newest first is fine; the caller decides
// the order). Safe to call often: already-done or queued ids are skipped.
export function prepareThumbs(list) {
  const pick = list.length > MAX_THUMBS ? list.slice(0, MAX_THUMBS) : list;
  for (const p of pick) {
    if (thumbs.has(p.id) || queued.has(p.id)) continue;
    queued.add(p.id); queue.push(p);
  }
  pump();
}

function pump() {
  while (running < 2 && queue.length) {
    const p = queue.shift();
    running += 1;
    idle(() => {
      makeThumb(p.url).then((t) => {
        thumbs.set(p.id, t); queued.delete(p.id);
        running -= 1; emit(); pump();
      });
    });
  }
}

function cacheBust(url) { return url + (url.includes("?") ? "&" : "?") + "mosaic=1"; }

function loadImage(url) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // photos live on R2; CORS lets the canvas read pixels
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });
}

// Decode a picture small. createImageBitmap with a resize decodes off the main
// thread where supported; otherwise fall back to a plain <img>. If the
// browser has a non-CORS copy cached, retry once with a cache-busting query.
export async function decodeSmall(url, width) {
  for (const u of [url, cacheBust(url)]) {
    if (typeof createImageBitmap === "function" && typeof fetch === "function") {
      try {
        const r = await fetch(u, { mode: "cors", credentials: "omit" });
        if (r.ok) {
          const blob = await r.blob();
          try { return await createImageBitmap(blob, { resizeWidth: width, resizeQuality: "medium" }); }
          catch { try { return await createImageBitmap(blob); } catch { /* fall through */ } }
        }
      } catch { /* try the <img> path */ }
    }
    const img = await loadImage(u);
    if (img && img.naturalWidth) return img;
  }
  return null;
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function dims(img) { return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }; }

function drawCover(ctx, img, W, H, fx = 0.5, fy = 0.5) {
  const { w: iw, h: ih } = dims(img);
  const s = Math.max(W / iw, H / ih);
  const w = iw * s, h = ih * s;
  ctx.drawImage(img, (W - w) * fx, (H - h) * fy, w, h);
}

let avgCtx = null; // one small shared canvas for measuring average colors
async function makeThumb(url) {
  const img = await decodeSmall(url, 160);
  if (!img) return null;
  try {
    const c = canvas(THUMB, THUMB);
    const ctx = c.getContext("2d");
    drawCover(ctx, img, THUMB, THUMB, 0.5, 0.4);
    if (!avgCtx) avgCtx = canvas(8, 8).getContext("2d", { willReadFrequently: true });
    const sx = avgCtx;
    sx.clearRect(0, 0, 8, 8);
    drawCover(sx, img, 8, 8, 0.5, 0.4);
    const d = sx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    if (img.close) img.close();
    return { img: c, rgb: [r / n, g / n, b / n] };
  } catch { return null; } // tainted canvas (no CORS): leave this one out
}

const targets = new Map(); // url -> Promise<image|null>
export function loadTarget(url) {
  if (!targets.has(url)) targets.set(url, decodeSmall(url, 640));
  return targets.get(url);
}

// Small seeded random so the fill order is the same every time the card
// opens for an event (new photos add cells; old ones stay put).
function seeded(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

const dist = (a, b) => { const r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2]; return 2 * r * r + 4 * g * g + 3 * bl * bl; };

// Create a mosaic on a canvas. Call update(readyThumbs) whenever more
// thumbnails are ready; it animates the new tiles in. destroy() stops it.
export function createMosaic(cv, { targetUrl, focusX = 0.5, focusY = 0.5, seed = "halo", maxDpr = 2, onStats } = {}) {
  let alive = true, raf = 0;
  let W = 0, H = 0, dpr = 1, cols = 0, rows = 0;
  let cellRGB = null, order = null, base = null, still = null;
  let pool = [];                     // ready thumbs
  const use = new Map();             // photo id -> times used
  let filled = [];                   // cell index -> thumb (or undefined)
  let filledN = 0;
  let anims = [];                    // { cell, thumb, t0 }
  let opened = 0;
  const ctx = cv.getContext("2d");

  function setup() {
    W = Math.max(1, cv.clientWidth); H = Math.max(1, cv.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr, 2560 / W);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const tile = Math.min(60, Math.max(9, Math.sqrt((W * H) / 1300)));
    cols = Math.max(8, Math.round(W / tile)); rows = Math.max(6, Math.round(H / tile));
  }
  const cx = (c) => Math.round((c * cv.width) / cols);
  const cy = (r) => Math.round((r * cv.height) / rows);

  function buildFromTarget(img) {
    const S = 3;
    const sc = canvas(cols * S, rows * S), sx = sc.getContext("2d", { willReadFrequently: true });
    sx.fillStyle = "#14101c"; sx.fillRect(0, 0, sc.width, sc.height);
    if (img) drawCover(sx, img, sc.width, sc.height, focusX, focusY);
    let d = null;
    try { d = sx.getImageData(0, 0, sc.width, sc.height).data; } catch { d = null; }
    cellRGB = new Array(cols * rows);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      let R = 0, G = 0, B = 0;
      if (d) for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const i = ((r * S + y) * sc.width + (c * S + x)) * 4; R += d[i]; G += d[i + 1]; B += d[i + 2];
      }
      const n = S * S; cellRGB[r * cols + c] = d ? [R / n, G / n, B / n] : [40, 30, 50];
    }
    // Faint, soft copy of the target under the empty cells.
    base = canvas(cv.width, cv.height);
    const bx = base.getContext("2d");
    bx.fillStyle = "#0a0410"; bx.fillRect(0, 0, base.width, base.height);
    bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = "high";
    bx.globalAlpha = 0.5; bx.drawImage(sc, 0, 0, base.width, base.height); bx.globalAlpha = 1;
    // Fill order: random, but the middle of the picture (faces) first.
    const rnd = seeded(seed);
    const fx = focusX, fy = focusY;
    order = Array.from({ length: cols * rows }, (_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const dx = (c + 0.5) / cols - fx, dy = ((r + 0.5) / rows - fy) * (rows / cols);
      return { i, k: rnd() * 0.75 + Math.sqrt(dx * dx + dy * dy) };
    }).sort((a, b) => a.k - b.k).map((o) => o.i);
    still = canvas(cv.width, cv.height);
    still.getContext("2d").drawImage(base, 0, 0);
    filled = new Array(cols * rows); filledN = 0; use.clear(); anims = [];
  }

  function pick(cell) {
    const want = cellRGB[cell];
    const c = cell % cols;
    const left = c > 0 ? filled[cell - 1] : null, up = cell >= cols ? filled[cell - cols] : null;
    let best = null, bestS = Infinity;
    for (const t of pool) {
      if ((left && left.id === t.id) || (up && up.id === t.id)) continue;
      const s = dist(want, t.rgb) * (1 + 0.3 * (use.get(t.id) || 0)) + (use.get(t.id) || 0) * 40;
      if (s < bestS) { bestS = s; best = t; }
    }
    return best || pool[0];
  }

  function drawTile(g, cell, t, alpha = 1, scale = 1) {
    const c = cell % cols, r = Math.floor(cell / cols);
    const x0 = cx(c), x1 = cx(c + 1), y0 = cy(r), y1 = cy(r + 1);
    const w = (x1 - x0) * scale, h = (y1 - y0) * scale;
    const x = (x0 + x1) / 2 - w / 2, y = (y0 + y1) / 2 - h / 2;
    // Tint toward the cell, picking the overlay color so the tile's average
    // lands on the cell's color (mean shift): the big picture reads clearly
    // while the guest photo still shows through.
    const want = cellRGB[cell], have = t.rgb;
    const o = [0, 1, 2].map((k) => Math.max(0, Math.min(255, Math.round((want[k] - (1 - TINT) * have[k]) / TINT))));
    g.globalAlpha = alpha;
    g.drawImage(t.img, x, y, w, h);
    g.fillStyle = `rgba(${o[0]},${o[1]},${o[2]},${TINT})`;
    g.fillRect(x, y, w, h);
    g.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!alive || !still) return;
    ctx.drawImage(still, 0, 0);
    const sx = still.getContext("2d");
    const next = [];
    for (const a of anims) {
      const k = (now - a.t0) / 520;
      if (k <= 0) { next.push(a); continue; }
      if (k >= 1) { drawTile(sx, a.cell, a.thumb); drawTile(ctx, a.cell, a.thumb); continue; }
      const e = 1 - Math.pow(1 - k, 3);
      drawTile(ctx, a.cell, a.thumb, e, 1 + (1 - e) * 0.9);
      next.push(a);
    }
    anims = next;
    if (anims.length) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };

  function fill() {
    if (!cellRGB || !pool.length) { kick(); return; }
    const want = Math.min(cols * rows, pool.length * PER_PHOTO);
    const now = performance.now();
    const first = filledN === 0;
    const adding = want - filledN;
    if (adding <= 0) { kick(); return; }
    const span = first ? Math.min(2600, 500 + adding * 3) : Math.min(1400, 300 + adding * 20);
    for (let n = 0; filledN < want; n++) {
      const cell = order[filledN];
      const t = pick(cell);
      filled[cell] = t; use.set(t.id, (use.get(t.id) || 0) + 1); filledN += 1;
      anims.push({ cell, thumb: t, t0: now + (span * n) / Math.max(1, adding) });
    }
    if (onStats) onStats({ used: use.size, filled: filledN, cells: cols * rows });
    kick();
  }

  setup();
  opened = performance.now();
  const ready = (targetUrl ? loadTarget(targetUrl) : Promise.resolve(null)).then((img) => {
    if (!alive) return;
    buildFromTarget(img);
    ctx.drawImage(still, 0, 0);
    fill();
    if (onStats) onStats({ used: use.size, filled: filledN, cells: cols * rows, targetMs: Math.round(performance.now() - opened) });
  });

  return {
    ready,
    update(list) {
      pool = list.filter(Boolean);
      if (cellRGB) fill();
    },
    destroy() { alive = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
