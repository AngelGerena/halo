// HALO — find the faces in a cover photo (in the browser) and return a focal
// point (0..1, 0..1) so every crop keeps heads in view.
//
// Uses MediaPipe's BlazeFace (short range) via @mediapipe/tasks-vision. Runs in
// Safari, Chrome, Firefox. Loaded lazily: only the host's cover uploader ever
// pays for it. WASM + model come from the official CDNs; if either is
// unreachable this resolves to null and the caller falls back to the server's
// attention heuristic (netlify/functions/cover-focus.js).
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

// Stage 2: when faces are too small or too blurry (a wide shot of the
// ceremony), find PEOPLE instead and anchor on the top of them, where the
// heads are. EfficientDet-Lite0 restricted to the "person" class.
const PERSON_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

let filesetPromise = null, faceDetPromise = null, personDetPromise = null;
async function getFileset() {
  if (!filesetPromise) {
    filesetPromise = (async () => {
      const mod = await import("@mediapipe/tasks-vision");
      const fileset = await mod.FilesetResolver.forVisionTasks(WASM_URL);
      return { mod, fileset };
    })().catch((e) => { filesetPromise = null; throw e; });
  }
  return filesetPromise;
}
async function getDetector() {
  if (!faceDetPromise) {
    faceDetPromise = (async () => {
      const { mod, fileset } = await getFileset();
      return mod.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "IMAGE",
        minDetectionConfidence: 0.4,
      });
    })().catch((e) => { faceDetPromise = null; throw e; });
  }
  return faceDetPromise;
}
async function getPersonDetector() {
  if (!personDetPromise) {
    personDetPromise = (async () => {
      const { mod, fileset } = await getFileset();
      return mod.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: PERSON_MODEL_URL },
        runningMode: "IMAGE",
        scoreThreshold: 0.35,
        categoryAllowlist: ["person"],
      });
    })().catch((e) => { personDetPromise = null; throw e; });
  }
  return personDetPromise;
}

async function loadBitmap(file) {
  // Downscale for speed; BlazeFace short-range is happiest around 1000px.
  const bmp = await createImageBitmap(file);
  const max = 1200;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (scale === 1) return bmp;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/**
 * @param {File|Blob} file image
 * @returns {Promise<{x:number,y:number,faces:number,people?:number}|null>} focal point or null
 */
export async function findFaceFocus(file) {
  let img = null;
  try {
    img = await loadBitmap(file);
    const W = img.width, H = img.height;
    let detections = [];
    try { detections = (await getDetector()).detect(img).detections || []; } catch (e) { console.warn("face detector unavailable", e); }
    if (detections.length === 0) {
      // Stage 2: people boxes. Heads sit at the top of a person box, so the
      // focal row is the top of the highest confident box plus a little, and
      // the focal column is the score-weighted centre of the boxes.
      try {
        const people = ((await getPersonDetector()).detect(img).detections || []).filter((d) => d.boundingBox);
        if (people.length) {
          let topY = Infinity, sx = 0, sw = 0;
          for (const d of people) {
            const b = d.boundingBox, sc = d.categories?.[0]?.score || 0.5;
            topY = Math.min(topY, b.originY + b.height * 0.08);
            sx += (b.originX + b.width / 2) * sc; sw += sc;
          }
          const cx = sw ? sx / sw / W : 0.5;
          const cy = Math.max(0, Math.min(1, (topY + H * 0.05) / H));
          img.close?.();
          return { x: Math.max(0, Math.min(1, cx)), y: cy, faces: 0, people: people.length };
        }
      } catch (e) { console.warn("person detector unavailable", e); }
      img.close?.();
      return null;
    }
    // Union of all face boxes, then its centre, nudged up a touch so there's
    // headroom above the hairline rather than the box being dead-centre.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of detections) {
      const b = d.boundingBox; if (!b) continue;
      x0 = Math.min(x0, b.originX); y0 = Math.min(y0, b.originY);
      x1 = Math.max(x1, b.originX + b.width); y1 = Math.max(y1, b.originY + b.height);
    }
    if (!Number.isFinite(x0)) return null;
    const cx = (x0 + x1) / 2 / W;
    const cy = ((y0 + y1) / 2 - (y1 - y0) * 0.15) / H;
    return { x: Math.max(0, Math.min(1, cx)), y: Math.max(0, Math.min(1, cy)), faces: detections.length };
  } catch (e) {
    console.warn("faceFocus unavailable", e);
    return null;
  }
}
