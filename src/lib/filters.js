// HALO fun filters: free photo looks that run on the guest's phone.
//
// No AI service and nothing leaves the phone until the guest taps Send. Every
// filter is plain 2D canvas: a per-pixel colour pass through lookup tables
// (fast, one loop), plus a few layers the GPU blends for us (grain, glow,
// vignette, light leaks). Works on iPhone Safari without ctx.filter, which
// older iOS versions don't support.
//
// Output matches what the upload step already sends: a JPEG with a long edge
// of at most 2560 px (see shrink.js), so filtered photos upload just as fast.

export const FILTER_MAX_EDGE = 2560;
const QUALITY = 0.88;

// Order shown to guests. `id` is what's saved in photos.filter.
export const FILTERS = [
  { id: "none", label: "filters.none" },
  { id: "film", label: "filters.film" },
  { id: "vintage", label: "filters.vintage" },
  { id: "glow", label: "filters.glow" },
  { id: "sketch", label: "filters.sketch" },
  { id: "golden", label: "filters.golden" },
  { id: "cinematic", label: "filters.cinematic" },
  { id: "pop", label: "filters.pop" },
];
export const FILTER_IDS = FILTERS.map((f) => f.id);

// ---------- canvas helpers ----------
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function ctx2d(c) { return c.getContext("2d", { willReadFrequently: false }); }
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Decode a picked photo upright (EXIF orientation) and draw it once at upload
// size. Returns a canvas, or null if this browser can't read the file.
export async function decodeToCanvas(file, maxEdge = FILTER_MAX_EDGE) {
  let bmp;
  try {
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { bmp = await createImageBitmap(file); }
  } catch {
    // Older Safari: fall back to an <img>.
    try {
      const url = URL.createObjectURL(file);
      try {
        bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch { return null; }
  }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
  if (!w || !h) { bmp.close?.(); return null; }
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = makeCanvas(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  const x = ctx2d(c);
  x.imageSmoothingQuality = "high";
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

// Scaled copy of a canvas (for previews and thumbnails).
export function scaledCopy(src, maxEdge) {
  const s = Math.min(1, maxEdge / Math.max(src.width, src.height));
  const c = makeCanvas(Math.max(1, Math.round(src.width * s)), Math.max(1, Math.round(src.height * s)));
  const x = ctx2d(c);
  x.imageSmoothingQuality = "high";
  x.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// Smooth tone curve through (x,y) points 0..255, as a 256-entry table.
function curve(points) {
  const lut = new Uint8ClampedArray(256);
  const p = points;
  for (let i = 0; i < 256; i++) {
    let k = 0;
    while (k < p.length - 2 && i > p[k + 1][0]) k++;
    const [x0, y0] = p[k], [x1, y1] = p[k + 1];
    const t = x1 === x0 ? 0 : (i - x0) / (x1 - x0);
    const st = t * t * (3 - 2 * t); // smoothstep between control points
    lut[i] = y0 + (y1 - y0) * (0.35 * t + 0.65 * st);
  }
  return lut;
}

// Film grain: one random tile, made once, laid over the photo with an
// overlay blend. Scaled with the photo so it looks the same on a thumbnail
// and on the full image.
let grainTile = null;
function grain() {
  if (grainTile) return grainTile;
  const n = 256, c = makeCanvas(n, n), x = ctx2d(c);
  const d = x.createImageData(n, n), a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    // Two randoms averaged: softer, more film-like than flat white noise.
    const v = 128 + ((Math.random() + Math.random() - 1) * 120);
    a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255;
  }
  x.putImageData(d, 0, 0);
  grainTile = c;
  return c;
}
function addGrain(c, amount) {
  const x = ctx2d(c);
  const scale = Math.max(1, Math.max(c.width, c.height) / 1400);
  x.save();
  x.globalCompositeOperation = "overlay";
  x.globalAlpha = amount;
  x.scale(scale, scale);
  x.fillStyle = x.createPattern(grain(), "repeat");
  x.fillRect(0, 0, c.width / scale + 1, c.height / scale + 1);
  x.restore();
}

function vignette(c, strength, color = "0,0,0") {
  const x = ctx2d(c), w = c.width, h = c.height;
  const r = Math.hypot(w, h) / 2;
  const g = x.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r * 1.02);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  x.save();
  x.globalCompositeOperation = "multiply";
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.restore();
}

// Cheap, smooth blur on the GPU: shrink then grow back in steps.
function softBlur(src, factor) {
  let cur = src, w = src.width, h = src.height;
  const steps = [];
  let f = 1;
  while (f < factor) { f = Math.min(factor, f * 2); steps.push(f); }
  for (const s of steps) {
    const c = makeCanvas(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
    const x = ctx2d(c); x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  for (let i = steps.length - 2; i >= -1; i--) {
    const s = i >= 0 ? steps[i] : 1;
    const c = makeCanvas(Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s)));
    const x = ctx2d(c); x.imageSmoothingQuality = "high";
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  return cur;
}

// One colour pass. `fn(r,g,b,out)` writes into out[0..2]; luts speed it up.
function pixelPass(c, fn) {
  const x = ctx2d(c);
  const img = x.getImageData(0, 0, c.width, c.height);
  const a = img.data, o = [0, 0, 0];
  for (let i = 0, n = a.length; i < n; i += 4) {
    fn(a[i], a[i + 1], a[i + 2], o);
    a[i] = o[0]; a[i + 1] = o[1]; a[i + 2] = o[2];
  }
  x.putImageData(img, 0, 0);
}

// ---------- the looks ----------
const L = {};

L.film = (c) => {
  const tone = curve([[0, 14], [50, 40], [128, 128], [205, 218], [255, 246]]);
  pixelPass(c, (r, g, b, o) => {
    const y = tone[(r * 77 + g * 151 + b * 28) >> 8];
    o[0] = y; o[1] = y; o[2] = clamp(y - 2);
  });
  vignette(c, 0.32);
  addGrain(c, 0.26);
};

L.vintage = (c) => {
  const R = curve([[0, 38], [70, 84], [140, 160], [210, 226], [255, 248]]);
  const G = curve([[0, 30], [70, 74], [140, 146], [210, 210], [255, 236]]);
  const B = curve([[0, 46], [70, 70], [140, 124], [210, 182], [255, 210]]);
  pixelPass(c, (r, g, b, o) => {
    const y = (r * 77 + g * 151 + b * 28) >> 8;
    // a touch less colour, then the warm faded curves
    o[0] = R[clamp(y + (r - y) * 0.78) | 0];
    o[1] = G[clamp(y + (g - y) * 0.78) | 0];
    o[2] = B[clamp(y + (b - y) * 0.78) | 0];
  });
  // soft warm light leak from the top-left corner
  const x = ctx2d(c), w = c.width, h = c.height;
  const g = x.createRadialGradient(w * 0.05, h * 0.02, 0, w * 0.05, h * 0.02, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(255,170,90,0.28)");
  g.addColorStop(1, "rgba(255,170,90,0)");
  x.save(); x.globalCompositeOperation = "screen"; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
  vignette(c, 0.28, "40,20,10");
  addGrain(c, 0.16);
};

L.glow = (c) => {
  const lift = curve([[0, 4], [64, 62], [128, 132], [192, 202], [255, 255]]);
  pixelPass(c, (r, g, b, o) => {
    o[0] = lift[r]; o[1] = lift[g]; o[2] = lift[b > 4 ? b - 2 : b];
  });
  const blur = softBlur(c, Math.max(8, Math.round(Math.max(c.width, c.height) / 90)));
  const x = ctx2d(c);
  x.save();
  x.globalCompositeOperation = "screen";
  x.globalAlpha = 0.42;
  x.drawImage(blur, 0, 0, c.width, c.height);
  x.globalCompositeOperation = "soft-light";
  x.globalAlpha = 0.3;
  x.fillStyle = "rgb(255,214,190)";
  x.fillRect(0, 0, c.width, c.height);
  x.restore();
};

// Box blur on one channel (sliding window). Three passes ~ gaussian.
function boxBlur1(src, dst, w, h, r) {
  const div = 1 / (r + r + 1);
  // horizontal into dst
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = src[row] * (r + 1);
    for (let i = 1; i <= r; i++) acc += src[row + Math.min(i, w - 1)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * div;
      acc += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
  // vertical back into src
  for (let x = 0; x < w; x++) {
    let acc = dst[x] * (r + 1);
    for (let i = 1; i <= r; i++) acc += dst[Math.min(i, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc * div;
      acc += dst[Math.min(y + r + 1, h - 1) * w + x] - dst[Math.max(y - r, 0) * w + x];
    }
  }
}

L.sketch = (c) => {
  const x = ctx2d(c), w = c.width, h = c.height;
  const img = x.getImageData(0, 0, w, h), a = img.data, n = w * h;
  const gray = new Float32Array(n), blur = new Float32Array(n), tmp = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) gray[i] = (a[p] * 77 + a[p + 1] * 151 + a[p + 2] * 28) >> 8;
  // a whisper of smoothing first, so phone noise and JPEG blocks don't turn into scribbles
  boxBlur1(gray, tmp, w, h, 1); boxBlur1(gray, tmp, w, h, 1);
  blur.set(gray);
  const r = Math.max(2, Math.round(Math.max(w, h) / 360));
  boxBlur1(blur, tmp, w, h, r); boxBlur1(blur, tmp, w, h, r); boxBlur1(blur, tmp, w, h, r);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // colour dodge of the gray over its blurred inverse = gray / blur
    let d = (gray[i] / (blur[i] + 1)) * 1.04; // values close to 1 become clean paper
    d = d > 1 ? 1 : d;
    d = d * d * Math.sqrt(d); // crisper pencil lines without heavy blotches
    const s = blur[i] / 255; // the blurred copy doubles as soft shading
    const v = 255 * d * (0.74 + 0.26 * s); // light graphite shading keeps form
    // warm paper white, graphite gray
    a[p] = v * 0.985 + 4; a[p + 1] = v * 0.965 + 4; a[p + 2] = v * 0.92 + 6;
  }
  x.putImageData(img, 0, 0);
  addGrain(c, 0.14); // paper tooth
};

L.golden = (c) => {
  const tone = curve([[0, 8], [64, 66], [128, 138], [192, 206], [255, 252]]);
  pixelPass(c, (r, g, b, o) => {
    const y = (r * 77 + g * 151 + b * 28) >> 8;
    const rr = y + (r - y) * 1.12, gg = y + (g - y) * 1.12, bb = y + (b - y) * 1.12;
    o[0] = tone[clamp(rr * 1.06 + 6) | 0];
    o[1] = tone[clamp(gg * 1.0 + 2) | 0];
    o[2] = tone[clamp(bb * 0.84) | 0];
  });
  const x = ctx2d(c), w = c.width, h = c.height;
  // low sun from the upper right
  const sun = x.createRadialGradient(w * 0.9, h * 0.05, 0, w * 0.9, h * 0.05, Math.max(w, h) * 0.95);
  sun.addColorStop(0, "rgba(255,190,100,0.42)");
  sun.addColorStop(0.5, "rgba(255,150,70,0.14)");
  sun.addColorStop(1, "rgba(255,140,60,0)");
  x.save(); x.globalCompositeOperation = "screen"; x.fillStyle = sun; x.fillRect(0, 0, w, h); x.restore();
  vignette(c, 0.22, "60,25,0");
};

L.cinematic = (c) => {
  const tone = curve([[0, 6], [40, 30], [128, 128], [215, 228], [255, 248]]);
  pixelPass(c, (r, g, b, o) => {
    const y = (r * 77 + g * 151 + b * 28) >> 8;
    // slightly muted colour
    let rr = y + (r - y) * 0.85, gg = y + (g - y) * 0.85, bb = y + (b - y) * 0.85;
    // teal shadows, warm highlights
    const t = y / 255, sh = (1 - t) * (1 - t), hi = t * t;
    rr += -16 * sh + 14 * hi;
    gg += 6 * sh + 4 * hi;
    bb += 18 * sh - 14 * hi;
    o[0] = tone[clamp(rr) | 0]; o[1] = tone[clamp(gg) | 0]; o[2] = tone[clamp(bb) | 0];
  });
  vignette(c, 0.38, "0,10,20");
  addGrain(c, 0.08);
};

L.pop = (c) => {
  const tone = curve([[0, 0], [60, 50], [128, 132], [196, 214], [255, 255]]);
  pixelPass(c, (r, g, b, o) => {
    const y = (r * 77 + g * 151 + b * 28) >> 8;
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const sat = (mx - mn) / 255;
    // vibrance: lift dull colours more than already-strong ones (keeps skin natural)
    const k = 1.15 + 0.55 * (1 - sat);
    o[0] = tone[clamp(y + (r - y) * k) | 0];
    o[1] = tone[clamp(y + (g - y) * k) | 0];
    o[2] = tone[clamp(y + (b - y) * k) | 0];
  });
};

// Render a filter into a canvas of the given size (or the source size).
export function renderFilter(id, src, maxEdge) {
  const c = maxEdge ? scaledCopy(src, maxEdge) : scaledCopy(src, Math.max(src.width, src.height));
  if (id && id !== "none" && L[id]) L[id](c);
  return c;
}

export function canvasToBlob(c, quality = QUALITY) {
  return new Promise((res) => c.toBlob((b) => res(b), "image/jpeg", quality));
}

// Public: File/Blob in, JPEG Blob out (long edge <= 2560 px).
export async function applyFilter(id, fileOrBlob, { maxEdge = FILTER_MAX_EDGE, quality = QUALITY } = {}) {
  const src = await decodeToCanvas(fileOrBlob, maxEdge);
  if (!src) throw new Error("decode failed");
  const out = renderFilter(id, src, maxEdge);
  const blob = await canvasToBlob(out, quality);
  src.width = src.height = 0; out.width = out.height = 0; // free memory early on phones
  if (!blob) throw new Error("encode failed");
  return blob;
}
