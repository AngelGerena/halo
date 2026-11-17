// HALO — add the event's music to a saved highlight video (background job).
//
// iPhone Safari can't reliably put sound into a video a web page makes, so
// highlight videos came out silent. The browser now uploads the video, and
// this job adds the music on the server with ffmpeg: the track is looped to
// the video's length, faded in over 1.5 s and out over the last 2.5 s, and
// encoded as AAC (MP4) or Opus (WebM). The picture is copied as is.
//
// POST { eventId, id }  (owner, co-host or admin) -> 202 right away.
// Progress lives on the highlight entry in events.highlights:
//   audio: "pending" -> "done" (path now points at the version with music)
//                    -> "failed" (the original silent video stays)
//                    -> "none"   (the event is set to no music)
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { getObjectBuffer, putObject, deleteObjects } from "./_r2.js";
import { siteBase } from "./_email.js";
import { musicFor } from "../../src/lib/music.js";

// The bundled ffmpeg binary. Zipping can drop its "executable" flag, so a
// copy in /tmp with the flag set is used when the original can't run.
async function ffmpegPath() {
  let p = null;
  try { const m = await import("ffmpeg-static"); p = (m && (m.default || m)) || null; if (typeof p !== "string") p = null; }
  catch (e) { console.error("ffmpeg-static load failed:", e.message); }
  const candidates = [p, path.join(process.cwd(), "node_modules/ffmpeg-static/ffmpeg"), "/var/task/node_modules/ffmpeg-static/ffmpeg"].filter(Boolean);
  for (const c of candidates) {
    try { await fs.access(c, fs.constants ? fs.constants.X_OK : 1); return c; } catch { /* try a /tmp copy */ }
    try {
      await fs.access(c);
      const tmp = path.join(os.tmpdir(), "halo-ffmpeg");
      try { await fs.access(tmp, 1); return tmp; } catch {}
      await fs.copyFile(c, tmp);
      await fs.chmod(tmp, 0o755);
      return tmp;
    } catch { /* next */ }
  }
  console.error("ffmpeg binary not found in", candidates.join(", "), "- trying ffmpeg on PATH");
  return "ffmpeg";
}

function run(bin, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    const t = setTimeout(() => { try { p.kill("SIGKILL"); } catch {} reject(new Error("ffmpeg timed out")); }, timeoutMs);
    p.on("error", (e) => { clearTimeout(t); reject(e); });
    p.on("close", (code) => { clearTimeout(t); code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`)); });
  });
}

// The event's track as bytes: a library/uploaded file on R2, a file on the
// site (/music/...), or an https link.
async function loadMusic(ref) {
  if (/^https?:\/\//i.test(ref)) {
    const r = await fetch(ref);
    if (!r.ok) throw new Error(`music ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  if (ref.startsWith("/")) {
    const r = await fetch(siteBase() + ref);
    if (!r.ok) throw new Error(`music ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return getObjectBuffer(ref.replace(/^\/+/, ""));
}

async function setAudio(supabase, eventId, id, patch) {
  const { data: ev } = await supabase.from("events").select("highlights").eq("id", eventId).maybeSingle();
  const list = Array.isArray(ev && ev.highlights) ? ev.highlights : [];
  if (!list.some((h) => h && h.id === id)) return false; // deleted meanwhile
  const next = list.map((h) => (h && h.id === id ? { ...h, ...patch } : h));
  await supabase.from("events").update({ highlights: next }).eq("id", eventId);
  return true;
}

export async function handler(event) {
  let supabase = null, eventId = null, id = null;
  const stage = async (st, extra = {}) => {
    console.log("highlight-music:", eventId, id, st, extra.audio_error || "");
    if (supabase && eventId && id) { try { await setAudio(supabase, eventId, id, { audio_stage: st, ...extra }); } catch {} }
  };
  try {
    return await run2(event, (s, i, e) => { supabase = s; eventId = i; id = e; }, stage);
  } catch (e) {
    const msg = String((e && e.message) || e).slice(0, 300);
    console.error("highlight-music crashed:", msg);
    await stage("crashed", { audio: "failed", audio_error: msg });
    return { statusCode: 500, body: "failed" };
  }
}

async function run2(event, bind, stage) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, id } = b;
  const auth = await authenticate(event);
  if (!auth.ok) { console.error("highlight-music: not signed in"); return { statusCode: 401, body: "Unauthorized" }; }
  if (!eventId || !id) return { statusCode: 400, body: "eventId and id required" };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) { console.error("highlight-music: forbidden"); return { statusCode: 403, body: "Forbidden" }; }
  bind(supabase, eventId, id);
  await stage("started", { audio: "pending", audio_error: null });

  const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  const item = ev && Array.isArray(ev.highlights) ? ev.highlights.find((h) => h && h.id === id) : null;
  if (!item) return { statusCode: 404, body: "Video not found" };

  let tracks = [];
  if (!ev.music_url) {
    const { data } = await supabase.from("music_library").select("storage_path,mood,active").eq("active", true);
    tracks = data || [];
  }
  const ref = musicFor(ev, tracks);
  if (!ref) { await stage("no-music", { audio: "none" }); return { statusCode: 200, body: "no music" }; }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-hl-"));
  try {
    // Re-runs start from the original upload, never from an earlier -music copy.
    const src = item.source_path || item.path;
    const webm = item.type === "video/webm" || /\.webm$/i.test(src);
    const inV = path.join(dir, webm ? "in.webm" : "in.mp4");
    const inA = path.join(dir, "music");
    const out = path.join(dir, webm ? "out.webm" : "out.mp4");
    const [vbuf, abuf] = await Promise.all([getObjectBuffer(src), loadMusic(ref)]);
    await stage("downloaded", { audio_debug: `video ${vbuf.length} B, music ${abuf.length} B (${String(ref).slice(-60)})` });
    if (abuf.length < 1000 || /^\s*</.test(abuf.subarray(0, 64).toString("utf8"))) throw new Error("the music file is empty or not audio: " + ref);
    await fs.writeFile(inV, vbuf);
    await fs.writeFile(inA, abuf);

    const bin = await ffmpegPath();
    await stage("encoding");
    const secs = Math.max(3, Number(item.seconds) || 60);
    const fadeOut = Math.max(0, secs - 2.5).toFixed(2);
    await run(bin, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inV,
      "-stream_loop", "-1", "-i", inA,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      ...(webm ? ["-c:a", "libopus", "-b:a", "160k"] : ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]),
      "-af", `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=2.5`,
      "-t", String(secs),
      out,
    ]);
    const data = await fs.readFile(out);
    if (data.length < 1000) throw new Error("ffmpeg made an empty file");

    // New file name so phones and the CDN don't keep the silent copy.
    const newPath = src.replace(/(\.[a-z0-9]+)?$/i, `-music-${Date.now().toString(36)}${webm ? ".webm" : ".mp4"}`);
    await putObject(newPath, data, webm ? "video/webm" : "video/mp4");
    const oldMusicCopy = item.source_path && item.path !== item.source_path ? item.path : null;
    const still = await setAudio(supabase, eventId, id, { path: newPath, source_path: src, audio: "done", audio_stage: "done", audio_error: null, audio_debug: `out ${data.length} B` });
    if (!still) { try { await deleteObjects([newPath]); } catch {} }
    else if (oldMusicCopy) { try { await deleteObjects([oldMusicCopy]); } catch {} }
    return { statusCode: 200, body: "ok" };
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
}
