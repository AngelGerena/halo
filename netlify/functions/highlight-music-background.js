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
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";
import { getObjectBuffer, putObject, deleteObjects } from "./_r2.js";
import { siteBase } from "./_email.js";
import { musicFor } from "../../src/lib/music.js";

const require = createRequire(import.meta.url);

function ffmpegPath() {
  try { const p = require("ffmpeg-static"); if (p) return p; } catch { /* below */ }
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
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { eventId, id } = b;
  const auth = await authenticate(event);
  if (!auth.ok) return { statusCode: 401, body: "Unauthorized" };
  if (!eventId || !id) return { statusCode: 400, body: "eventId and id required" };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) return { statusCode: 403, body: "Forbidden" };

  const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
  const item = ev && Array.isArray(ev.highlights) ? ev.highlights.find((h) => h && h.id === id) : null;
  if (!item) return { statusCode: 404, body: "Video not found" };

  let tracks = [];
  if (!ev.music_url) {
    const { data } = await supabase.from("music_library").select("storage_path,mood,active").eq("active", true);
    tracks = data || [];
  }
  const ref = musicFor(ev, tracks);
  if (!ref) { await setAudio(supabase, eventId, id, { audio: "none" }); return { statusCode: 200, body: "no music" }; }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "halo-hl-"));
  try {
    const webm = item.type === "video/webm" || /\.webm$/i.test(item.path);
    const inV = path.join(dir, webm ? "in.webm" : "in.mp4");
    const inA = path.join(dir, "music");
    const out = path.join(dir, webm ? "out.webm" : "out.mp4");
    const [vbuf, abuf] = await Promise.all([getObjectBuffer(item.path), loadMusic(ref)]);
    await fs.writeFile(inV, vbuf);
    await fs.writeFile(inA, abuf);

    const secs = Math.max(3, Number(item.seconds) || 60);
    const fadeOut = Math.max(0, secs - 2.5).toFixed(2);
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", inV,
      "-stream_loop", "-1", "-i", inA,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy",
      ...(webm ? ["-c:a", "libopus", "-b:a", "160k"] : ["-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"]),
      "-af", `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOut}:d=2.5`,
      "-shortest", "-t", String(secs),
      out,
    ]);
    const data = await fs.readFile(out);
    if (data.length < 1000) throw new Error("empty output");

    // New file name so phones and the CDN don't keep the silent copy.
    const newPath = item.path.replace(/(\.[a-z0-9]+)?$/i, `-music${webm ? ".webm" : ".mp4"}`);
    await putObject(newPath, data, webm ? "video/webm" : "video/mp4");
    const still = await setAudio(supabase, eventId, id, { path: newPath, audio: "done" });
    if (still) { try { await deleteObjects([item.path]); } catch { /* old copy stays */ } }
    else { try { await deleteObjects([newPath]); } catch {} }
    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("highlight-music failed:", e && e.message);
    await setAudio(supabase, eventId, id, { audio: "failed" });
    return { statusCode: 500, body: "failed" };
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
  }
}
