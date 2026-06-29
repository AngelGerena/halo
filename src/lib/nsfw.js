// HALO V2 Phase 3b — In-browser explicit-content auto-flag.
// Loads TensorFlow.js + nsfwjs from a CDN at runtime ONLY when first needed
// (keeps them out of the build and the main bundle, and avoids any npm/lockfile
// impact). Degrades to a no-op if anything fails — it never blocks an upload.
const TF_URL = "https://esm.sh/@tensorflow/tfjs@4.22.0";
const NSFW_URL = "https://esm.sh/nsfwjs@4.2.1";

let modelPromise = null;

async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [tf, nsfwjs] = await Promise.all([
        import(/* @vite-ignore */ TF_URL),
        import(/* @vite-ignore */ NSFW_URL),
      ]);
      await tf.ready();
      const load = nsfwjs.load || (nsfwjs.default && nsfwjs.default.load);
      return load();
    })().catch(() => null);
  }
  return modelPromise;
}

export function preloadNsfw() { getModel().catch(() => {}); }

// Classify a File. Returns { flagged, reason } and NEVER throws.
export async function classifyFile(file) {
  try {
    const model = await getModel();
    if (!model) return { flagged: false, reason: null };
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const preds = await model.classify(img);
    URL.revokeObjectURL(url);
    const p = {};
    preds.forEach((x) => { p[x.className] = x.probability; });
    const explicit = (p.Porn || 0) + (p.Hentai || 0);
    const flagged = explicit > 0.5 || (p.Sexy || 0) > 0.85;
    return { flagged, reason: flagged ? "explicit" : null };
  } catch {
    return { flagged: false, reason: null };
  }
}
