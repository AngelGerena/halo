// HALO — download photos as one ZIP, built right in the host's browser.
//
// Photos are already compressed JPEGs, so they're stored (not re-compressed):
// fast, and the CPU stays free. Each finished chunk goes into a Blob, which
// Chrome/Safari keep on disk for large files, so a few hundred photos is fine.
// Four photos download at a time; one that fails is retried, then skipped and
// listed in a "missing.txt" inside the ZIP so nothing is silently lost.

import { Zip, ZipPassThrough } from "fflate";

const enc = new TextEncoder();

export async function fetchBytes(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { mode: "cors", cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) { lastErr = e; await new Promise((res) => setTimeout(res, 800 * (i + 1))); }
  }
  throw lastErr;
}

// Save one photo with a proper filename (a plain link to another domain
// opens the image instead of downloading it).
export async function downloadOne(url, filename) {
  const bytes = await fetchBytes(url);
  saveBlob(new Blob([bytes], { type: /\.(mp4|mov|m4v|webm|3gp)$/i.test(filename) ? "video/mp4" : "image/jpeg" }), filename);
}

export function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

// items: [{ url, name }]. onProgress(done, total). Resolves { saved, missing }.
// extras: [{ name, text }] small text files added at the end (e.g. guestbook messages).
export async function downloadZip(items, zipName, onProgress = () => {}, extras = []) {
  const parts = [];
  let finish;
  const done = new Promise((res, rej) => { finish = { res, rej }; });
  const zip = new Zip((err, chunk, final) => {
    if (err) return finish.rej(err);
    parts.push(chunk);
    if (final) finish.res();
  });

  // Unique names inside the archive.
  const seen = new Map();
  const uniq = (n) => {
    const k = n.toLowerCase();
    const c = seen.get(k) || 0; seen.set(k, c + 1);
    return c ? n.replace(/(\.[^.]+)?$/, `-${c + 1}$1`) : n;
  };

  const missing = [];
  let next = 0, count = 0;
  const total = items.length;
  // Fetch 4 at a time, but add to the ZIP in arrival order (fflate needs one
  // file finished before the next one starts, which push(…, true) guarantees).
  async function worker() {
    while (next < total) {
      const it = items[next++];
      try {
        const bytes = await fetchBytes(it.url);
        const f = new ZipPassThrough(uniq(it.name));
        zip.add(f);
        f.push(bytes, true);
      } catch { missing.push(it.name); }
      onProgress(++count, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker));

  for (const x of extras) {
    const f = new ZipPassThrough(uniq(x.name));
    zip.add(f);
    f.push(enc.encode(x.text), true);
  }
  if (missing.length) {
    const f = new ZipPassThrough("missing.txt");
    zip.add(f);
    f.push(enc.encode("These photos could not be downloaded. Try again or download them one by one:\n\n" + missing.join("\n") + "\n"), true);
  }
  zip.end();
  await done;
  saveBlob(new Blob(parts, { type: "application/zip" }), zipName);
  return { saved: total - missing.length, missing };
}
