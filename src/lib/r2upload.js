// HALO — client-side R2 upload helpers.
// The browser never holds the R2 secret: it asks a Netlify function for a
// short-lived presigned PUT URL, then PUTs the file bytes straight to R2.

// Every network step has a deadline. On weak venue signal a request can stall
// without ever failing; a timeout turns that stall into an error, so the
// caller's retry / "waiting to send" path takes over instead of hanging.
const SIGN_TIMEOUT_MS = 15000;

// fetch() with an AbortController deadline. The deadline also covers reading
// the body (r.json()), so a response that stalls mid-body still fails.
export function fetchWithTimeout(url, opts = {}, ms = SIGN_TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opts, signal: ac.signal }).catch((e) => {
    clearTimeout(timer);
    if (ac.signal.aborted) { const err = new Error("Request timed out"); err.timeout = true; throw err; }
    throw e;
  });
}

// Guest photo uploads. Asks for `count` signed URLs at once (one round-trip for a burst),
// returns [{ uploadUrl, path }]. Upload each with putToR2().
export async function signPhotoUploads({ eventId, contributorId, count = 1, contentType = "image/jpeg", size }) {
  const r = await fetchWithTimeout("/.netlify/functions/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, contributorId, count, contentType, size }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Could not prepare upload");
  // Each item carries the exact Content-Type the URL was signed for; PUT with it.
  return j.items.map((it) => ({ ...it, contentType: j.contentType })); // [{ uploadUrl, path, contentType }]
}

// Admin hero/music uploads (passcode-gated). Returns { uploadUrl, path }.
export async function signAdminUpload({ passcode, kind, filename, contentType }) {
  const r = await fetch("/.netlify/functions/sign-upload-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passcode, kind, filename, contentType }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Could not prepare upload");
  return j; // { uploadUrl, path, contentType }
}

// Upload deadline is about stalls, not total time: a slow but moving upload
// (a big clip on crowded venue Wi-Fi) is never cut off, but if no bytes move
// for STALL_MS the attempt fails so the retry / "waiting to send" path takes
// over. After the last byte goes out, the server gets REPLY_MS to answer.
// A hard cap stops anything from hanging forever.
const STALL_MS = 40000;
const REPLY_MS = 60000;
const HARD_CAP_MS = 30 * 60 * 1000;
export function putTimeoutMs() { return STALL_MS; } // kept for older callers

// PUT raw bytes to a presigned R2 URL. The Content-Type MUST match what was signed.
// Uses XMLHttpRequest (not fetch) so we can report upload progress. Optional
// onProgress(fraction 0..1, loadedBytes, totalBytes) fires as bytes go out.
// Rejects on a non-2xx answer, a network error, or a stall.
export function putToR2(uploadUrl, file, contentType, onProgress) {
  const type = contentType || file.type || "application/octet-stream";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let done = false;
    let stall = null;
    const stalled = () => {
      if (done) return;
      try { xhr.abort(); } catch { /* ignore */ }
      fail(Object.assign(new Error("Upload stalled"), { timeout: true }));
    };
    const arm = (ms) => { clearTimeout(stall); stall = setTimeout(stalled, ms); };
    const cap = setTimeout(stalled, HARD_CAP_MS);
    function fail(err) { if (done) return; done = true; clearTimeout(stall); clearTimeout(cap); reject(err); }
    function ok() { if (done) return; done = true; clearTimeout(stall); clearTimeout(cap); resolve(true); }

    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", type);
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        arm(STALL_MS); // bytes are moving: push the stall deadline out
        if (!onProgress || !e.lengthComputable || !e.total) return;
        try { onProgress(Math.min(1, e.loaded / e.total), e.loaded, e.total); } catch { /* UI only */ }
      };
      xhr.upload.onload = () => arm(REPLY_MS); // body fully sent; wait for the answer
    }
    arm(STALL_MS);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) { try { onProgress(1, file.size || 0, file.size || 0); } catch { /* UI only */ } }
        ok();
      } else {
        const txt = (xhr.responseText || "").slice(0, 300);
        fail(new Error(`Upload failed (${xhr.status}) ${txt}`.trim()));
      }
    };
    xhr.onerror = () => fail(new Error("Upload failed (network)"));
    xhr.onabort = () => fail(new Error("Upload aborted"));
    xhr.send(file);
  });
}
