// HALO — shrink a photo on the guest's phone before it uploads.
//
// Phones shoot 4–12 MB photos. On venue Wi-Fi with a full room, sending those
// at full size is what makes uploads slow or fail. We redraw the photo at a
// long edge of 2560 px (still more than a 4K TV or an 8x10 print needs) as a
// high-quality JPEG, which is usually 0.5–1.2 MB.
//
// Safe by design: if the browser can't decode the file (an HEIC photo on a
// desktop browser, a corrupt file, an old phone), we return the original
// untouched so the upload still goes through exactly as before.

const MAX_EDGE = 2560;
const QUALITY = 0.85;
const SKIP_UNDER_BYTES = 900 * 1024; // already small: leave it alone

export async function shrinkImage(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  try {
    if (!file || !file.type || !file.type.startsWith("image/")) return file;
    if (file.type === "image/gif") return file; // keep animation

    let bmp;
    try {
      // imageOrientation keeps portrait phone shots upright once EXIF is stripped.
      bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      bmp = await createImageBitmap(file);
    }
    const { width: w, height: h } = bmp;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    if (scale === 1 && file.size <= SKIP_UNDER_BYTES && file.type === "image/jpeg") {
      bmp.close?.();
      return file;
    }
    const tw = Math.round(w * scale), th = Math.round(h * scale);

    let blob;
    if (typeof OffscreenCanvas !== "undefined") {
      const c = new OffscreenCanvas(tw, th);
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, tw, th);
      blob = await c.convertToBlob({ type: "image/jpeg", quality });
    } else {
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bmp, 0, 0, tw, th);
      blob = await new Promise((res) => c.toBlob(res, "image/jpeg", quality));
    }
    bmp.close?.();
    if (!blob || blob.size === 0) return file;
    // Never make a file bigger (e.g. an already-tight JPEG).
    if (blob.size >= file.size && scale === 1) return file;

    const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
  } catch {
    return file;
  }
}
