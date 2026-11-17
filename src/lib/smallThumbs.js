// Small thumbnails made in the browser, a couple at a time.
//
// Showing hundreds of full-size photos at once makes iPhone Safari run out of
// memory and reload the page ("A problem repeatedly occurred"). Each photo is
// loaded once, drawn into a small canvas, kept as a tiny JPEG blob URL, and
// the full image is let go before the next one starts.
const EDGE = 220;          // longest side of a thumbnail, px
const AT_ONCE = 2;         // full-size photos decoded at the same time
const cache = new Map();   // src -> Promise<string> (blob URL, or src on failure)
const queue = [];
let running = 0;

function pump() {
  while (running < AT_ONCE && queue.length) {
    const job = queue.shift();
    running++;
    make(job.src).then(job.resolve, () => job.resolve(job.src)).finally(() => { running--; pump(); });
  }
}

function make(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const s = Math.min(1, EDGE / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        img.onload = img.onerror = null; // clearing src below would fire onerror
        img.removeAttribute("src");      // let the full-size image go
        c.toBlob((b) => {
          c.width = c.height = 0;
          if (b) resolve(URL.createObjectURL(b)); else reject(new Error("toBlob"));
        }, "image/jpeg", 0.8);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });
}

export function smallThumb(src) {
  if (!src) return Promise.resolve("");
  let p = cache.get(src);
  if (!p) {
    p = new Promise((resolve) => { queue.push({ src, resolve }); pump(); });
    cache.set(src, p);
  }
  return p;
}
