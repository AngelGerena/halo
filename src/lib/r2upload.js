// HALO — client-side R2 upload helpers.
// The browser never holds the R2 secret: it asks a Netlify function for a
// short-lived presigned PUT URL, then PUTs the file bytes straight to R2.

// Guest photo uploads. Asks for `count` signed URLs at once (one round-trip for a burst),
// returns [{ uploadUrl, path }]. Upload each with putToR2().
export async function signPhotoUploads({ eventId, contributorId, count = 1, contentType = "image/jpeg" }) {
  const r = await fetch("/.netlify/functions/sign-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, contributorId, count, contentType }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Could not prepare upload");
  return j.items; // [{ uploadUrl, path }]
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

// PUT raw bytes to a presigned R2 URL. The Content-Type MUST match what was signed.
export async function putToR2(uploadUrl, file, contentType) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType || file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}) ${txt}`.trim());
  }
  return true;
}
