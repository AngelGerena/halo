// HALO — video guestbook: short "message for the couple" clips.
//
// A video message is a photos row with kind = 'message'. Like a clip, its
// still frame is storage_path and the video is video_path, so it goes through
// the same signed-upload path (sign-upload + R2) and the same insert trigger
// (storage_path must start with <event_id>/<contributor_id>/).
//
// Messages are NOT photos: every photo list (guest gallery, My photos, live
// wall rotation, host grid, highlight video, leaderboards) leaves them out.
// That filtering happens in JS, not in the query, because on a database where
// the event-extras SQL has not been run the `kind` column doesn't exist and a
// .neq("kind", ...) filter would make the whole request fail.

import { supabase } from "./supabase.js";
import { signPhotoUploads, putToR2 } from "./r2upload.js";
import { classifyQuick } from "./nsfw.js";
import { newId } from "./contributors.js";
import { MAX_CLIP_BYTES } from "./clip.js";

export const MESSAGE_SECONDS = 10;      // what we ask guests for
export const MESSAGE_MAX_SECONDS = 12;  // a little grace; longer than this: ask them to re-record

export const isMessage = (p) => !!p && (p.kind || "photo") === "message";
export const notMessage = (p) => !isMessage(p);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(fn, tries = 4) {
  let pause = 1000;
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= tries - 1 || (typeof navigator !== "undefined" && navigator.onLine === false)) throw e;
      await sleep(pause); pause *= 2.5;
    }
  }
}
function timed(promise, ms = 20000) {
  let tmr;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, rej) => { tmr = setTimeout(() => rej(Object.assign(new Error("Request timed out"), { timeout: true })), ms); }),
  ]).finally(() => clearTimeout(tmr));
}

// Too long to send as a message? (info comes from probeClip.)
export function messageTooLong(file, info) {
  return (file && file.size > MAX_CLIP_BYTES) || (info && info.duration > MESSAGE_MAX_SECONDS);
}

// Upload one video message. `info` is probeClip(file). Returns the inserted row.
// Review rules match other uploads: held for the host when the event is in
// review mode, or when the in-browser check flags the still frame.
export async function uploadVideoMessage({ event, who, file, info, onProgress }) {
  const poster = new File([info.poster], "frame.jpg", { type: "image/jpeg" });
  let flagged = false;
  if (info.decoded) {
    try { flagged = (await classifyQuick(poster)).flagged; } catch { /* never blocks */ }
  }
  const status = (event.moderation_mode === "review" || flagged) ? "pending" : "approved";

  const posterPath = await withRetry(async () => {
    const [s1] = await signPhotoUploads({ eventId: event.id, contributorId: who.id, count: 1, contentType: "image/jpeg", size: poster.size });
    await putToR2(s1.uploadUrl, poster, s1.contentType);
    return s1.path;
  });
  const videoPath = await withRetry(async () => {
    const [s2] = await signPhotoUploads({ eventId: event.id, contributorId: who.id, count: 1, contentType: file.type || "video/mp4", size: file.size });
    await putToR2(s2.uploadUrl, file, s2.contentType, onProgress);
    return s2.path;
  }, 5);

  // Id made once so a retry after a lost reply can't save the message twice.
  const rowIn = {
    id: newId(),
    event_id: event.id,
    contributor_id: who.id,
    kind: "message",
    storage_path: posterPath,
    video_path: videoPath,
    duration: info.duration || null,
    quality: 100,
    kept: true,
    width: info.width || null,
    height: info.height || null,
    has_minors: false,
    status,
    session_label: event.current_session || null,
    auto_flagged: flagged,
    tags: [],
  };
  await withRetry(async () => {
    const { error } = await timed(supabase.from("photos").insert(rowIn));
    if (error && error.code === "23505") return; // already saved by an earlier try
    if (error) throw error;
  }, 3);
  return rowIn;
}

// "0:08"
export function fmtSeconds(s) {
  const n = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
}
