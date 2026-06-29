// HALO brand tokens (Finesse OS design language)
export const C = {
  ink: "#16294C",        // church navy
  gold: "#C9A24B",       // church gold
  goldLight: "#E6C879",  // highlight gold (gradients, accents on navy)
  inkDeep: "#0E1B36",    // deepest navy (slideshow / gradient base)
  bg: "#F6F1E8",         // warm ivory
  second: "#5E6E8C",     // navy-grey (secondary text)
  text: "#3A3A42",
  white: "#ffffff",
  headerGrad: "linear-gradient(120deg, #0E1B36, #1E3461 60%, #2A4A6E)", // flame-inspired header
};

// ---- helpers ----
function bitsToHex(bits) {
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}
function popcount32(n) {
  n = n - ((n >>> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >>> 2) & 0x33333333);
  return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

// Hamming distance between two 16-char (64-bit) hex hashes. Returns 99 if unknown.
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return 99;
  let d = 0;
  for (let i = 0; i < a.length; i += 8) {
    const x = parseInt(a.slice(i, i + 8), 16) >>> 0;
    const y = parseInt(b.slice(i, i + 8), 16) >>> 0;
    d += popcount32(x ^ y);
  }
  return d;
}

// Client-side analysis on a downsampled copy so phones stay fast.
// Returns focus (noise-aware sharpness), exposure, a composite quality, and a
// perceptual hash (dHash) used for best-of-burst de-duplication.
export function scoreImage(fileOrUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = 96, H = Math.max(1, Math.round((img.height / img.width) * 96));
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);
      const n = W * H;
      const lum = new Float32Array(n);
      let sum = 0;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        lum[p] = l; sum += l;
      }
      const mean = sum / n;

      // edge energy at full (96px) scale — sensitive to both real detail AND noise
      let edge = 0;
      for (let y = 1; y < H; y++) {
        for (let x = 1; x < W; x++) {
          const idx = y * W + x;
          edge += Math.abs(lum[idx] - lum[idx - 1]) + Math.abs(lum[idx] - lum[idx - W]);
        }
      }
      const e96 = edge / n;
      const focusRaw = Math.min(100, e96 * 4); // legacy sharpness proxy

      // edge energy at half scale (48px box-downsample) — real structure survives
      // downscaling; sensor/ISO noise averages out. The ratio tells noise from detail.
      const W2 = Math.max(1, W >> 1), H2 = Math.max(1, H >> 1);
      const lum2 = new Float32Array(W2 * H2);
      for (let y = 0; y < H2; y++) {
        for (let x = 0; x < W2; x++) {
          const sx = x * 2, sy = y * 2;
          const sx1 = Math.min(sx + 1, W - 1), sy1 = Math.min(sy + 1, H - 1);
          lum2[y * W2 + x] = (lum[sy * W + sx] + lum[sy * W + sx1] + lum[sy1 * W + sx] + lum[sy1 * W + sx1]) / 4;
        }
      }
      let edge2 = 0;
      for (let y = 1; y < H2; y++) {
        for (let x = 1; x < W2; x++) {
          const idx = y * W2 + x;
          edge2 += Math.abs(lum2[idx] - lum2[idx - 1]) + Math.abs(lum2[idx] - lum2[idx - W2]);
        }
      }
      const e48 = edge2 / (W2 * H2);
      const ratio = e96 > 0 ? e48 / e96 : 1; // ~0.6-0.9 sharp, ~0.2-0.4 grainy

      // Noise penalty: only bites when structure does NOT survive downscaling.
      // Clean, sharp photos (ratio >= REF) are left unchanged — low regression risk.
      const REF = 0.5, MAXPEN = 35;
      const penalty = (1 - Math.min(ratio / REF, 1)) * MAXPEN;
      const focus = Math.round(Math.max(0, Math.min(100, focusRaw - penalty)));

      const exposure = Math.round((1 - Math.abs(mean - 128) / 128) * 100);
      const quality = Math.round(focus * 0.6 + exposure * 0.4);

      // dHash (perceptual hash) for burst de-duplication
      const dc = document.createElement("canvas");
      dc.width = 9; dc.height = 8;
      const dctx = dc.getContext("2d");
      dctx.drawImage(img, 0, 0, 9, 8);
      const dd = dctx.getImageData(0, 0, 9, 8).data;
      let bits = "";
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i = (y * 9 + x) * 4, j = (y * 9 + x + 1) * 4;
          const l1 = 0.299 * dd[i] + 0.587 * dd[i + 1] + 0.114 * dd[i + 2];
          const l2 = 0.299 * dd[j] + 0.587 * dd[j + 1] + 0.114 * dd[j + 2];
          bits += l1 > l2 ? "1" : "0";
        }
      }
      const phash = bitsToHex(bits);

      resolve({ quality, focus, exposure, width: img.width, height: img.height, phash });
    };
    img.onerror = () => resolve({ quality: 50, focus: 50, exposure: 50, width: 0, height: 0, phash: null });
    img.src = typeof fileOrUrl === "string" ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  });
}

export function fileToDataUrl(file) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(file);
  });
}
