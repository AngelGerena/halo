// HALO — admin music library (replaces the Mubert generator).
//
// Actions (POST { action, ... }), admin only:
//   list                          every track, active or not
//   import_starter { ids? }       copy starter-pack tracks from Pixabay's CDN into
//                                 R2 (music/library/pixabay-<id>.mp3) and record
//                                 them. Skips tracks already imported. Works in
//                                 small batches (time budget); call again while
//                                 `remaining` > 0.
//   sign { filename, contentType } presigned PUT for the admin's own track
//   add { path, title, artist, mood, duration }  record an uploaded track
//   update { id, title?, artist?, mood? }
//   toggle { id, active }
//   remove { id }                 deletes the file and the row
import { createClient } from "@supabase/supabase-js";
import { putObject, deleteObjects, presignPut } from "./_r2.js";
import { authenticate } from "./_auth.js";
import { STARTER_TRACKS } from "./_starterTracks.js";

const MOODS = ["romantic", "elegant", "worship", "celebration", "latin", "cinematic", "uplifting", "corporate", "acoustic"];
const AUDIO_CT = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg" };
const MAX_BYTES = 30 * 1024 * 1024;
const BUDGET_MS = 5000; // stay well inside the function time limit; the admin page keeps calling until done
const json = (statusCode, obj) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) });
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}

  const auth = await authenticate(event);
  if (!auth.ok) return json(401, { error: "Unauthorized" });
  if (!auth.isAdmin) return json(403, { error: "Forbidden" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { action } = b;

  try {
    if (action === "list") {
      const { data, error } = await supabase.from("music_library").select("*").order("mood").order("created_at");
      if (error) throw error;
      return json(200, { ok: true, rows: data || [], starterTotal: STARTER_TRACKS.length });
    }

    if (action === "import_starter") {
      const started = Date.now();
      const { data: have } = await supabase.from("music_library").select("external_id").not("external_id", "is", null);
      const done = new Set((have || []).map((r) => r.external_id));
      const want = Array.isArray(b.ids) && b.ids.length ? STARTER_TRACKS.filter((t) => b.ids.includes(t[0])) : STARTER_TRACKS;
      const todo = want.filter((t) => !done.has(`pixabay:${t[0]}`));
      let imported = 0;
      const failed = [];
      for (const [id, mood, title, artist, seconds, cdnPath] of todo) {
        if (Date.now() - started > BUDGET_MS) break;
        const src = `https://cdn.pixabay.com/audio/${cdnPath}`;
        try {
          const r = await fetch(src, { headers: { "User-Agent": "HALO music importer (halo.finessemedia.pro)" } });
          if (!r.ok) throw new Error(`download ${r.status}`);
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length < 10000 || buf.length > MAX_BYTES) throw new Error(`size ${buf.length}`);
          const path = `music/library/pixabay-${id}.mp3`;
          await putObject(path, buf, "audio/mpeg");
          const { error } = await supabase.from("music_library").insert({
            mood, title, artist, duration: seconds, storage_path: path, source: "pixabay",
            external_id: `pixabay:${id}`, source_url: `https://pixabay.com/music/id-${id}/`, active: true,
          });
          if (error) throw error;
          imported++;
        } catch (e) {
          failed.push({ id, title, error: String(e.message || e).slice(0, 120) });
        }
      }
      const remaining = todo.length - imported - failed.length;
      return json(200, { ok: true, imported, failed, remaining, total: STARTER_TRACKS.length });
    }

    if (action === "sign") {
      const ext = (String(b.filename || "").split(".").pop() || "").toLowerCase();
      const ct = AUDIO_CT[ext];
      if (!ct) return json(400, { error: "Upload an MP3, WAV, M4A, AAC or OGG file." });
      const path = `music/library/upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const uploadUrl = await presignPut(path, ct);
      return json(200, { ok: true, uploadUrl, path, contentType: ct });
    }

    if (action === "add") {
      const path = str(b.path, 200);
      if (!path.startsWith("music/library/") || path.includes("..")) return json(400, { error: "Invalid path" });
      const mood = MOODS.includes(b.mood) ? b.mood : "cinematic";
      const row = {
        mood, title: str(b.title, 120) || "Untitled", artist: str(b.artist, 120) || null,
        duration: Number.isFinite(Number(b.duration)) ? Math.round(Number(b.duration)) : null,
        storage_path: path, source: "upload", active: true,
      };
      const { data, error } = await supabase.from("music_library").insert(row).select().single();
      if (error) throw error;
      return json(200, { ok: true, row: data });
    }

    if (action === "update") {
      const patch = {};
      if (typeof b.title === "string") patch.title = str(b.title, 120) || "Untitled";
      if (typeof b.artist === "string") patch.artist = str(b.artist, 120) || null;
      if (MOODS.includes(b.mood)) patch.mood = b.mood;
      if (!Object.keys(patch).length) return json(400, { error: "Nothing to update" });
      const { error } = await supabase.from("music_library").update(patch).eq("id", b.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === "toggle") {
      const { error } = await supabase.from("music_library").update({ active: !!b.active }).eq("id", b.id);
      if (error) throw error;
      return json(200, { ok: true });
    }

    if (action === "remove") {
      const { data: row } = await supabase.from("music_library").select("storage_path").eq("id", b.id).maybeSingle();
      if (row && row.storage_path) { try { await deleteObjects([row.storage_path]); } catch (e) { console.error("R2 remove warning:", e.message); } }
      const { error } = await supabase.from("music_library").delete().eq("id", b.id);
      if (error) throw error;
      // Events that used this track fall back to Auto.
      if (row && row.storage_path) await supabase.from("events").update({ music_url: null }).eq("music_url", row.storage_path);
      return json(200, { ok: true });
    }

    return json(400, { error: "Unknown action" });
  } catch (e) {
    return json(500, { error: e.message || "Failed" });
  }
}
