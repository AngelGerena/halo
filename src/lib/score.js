// HALO brand tokens (Finesse OS design language)
export const C = {
  ink: "#1C2640",
  gold: "#C5A44B",
  bg: "#F2ECE4",
  second: "#6B8CAE",
  text: "#3A3530",
  white: "#ffffff",
};

// Client-side quality scoring. Runs on a downsampled copy so phones stay fast.
// Returns focus (edge energy), exposure (brightness balance), and a composite.
// NOTE: production tuning can move this server-side; the shape stays the same.
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

      // edge energy (sharpness proxy)
      let edge = 0;
      for (let y = 1; y < H; y++) {
        for (let x = 1; x < W; x++) {
          const idx = y * W + x;
          edge += Math.abs(lum[idx] - lum[idx - 1]) + Math.abs(lum[idx] - lum[idx - W]);
        }
      }
      const focus = Math.round(Math.min(100, (edge / n) * 4));
      const exposure = Math.round((1 - Math.abs(mean - 128) / 128) * 100);
      const quality = Math.round(focus * 0.6 + exposure * 0.4);

      resolve({ quality, focus, exposure, width: img.width, height: img.height });
    };
    img.onerror = () => resolve({ quality: 50, focus: 50, exposure: 50, width: 0, height: 0 });
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
