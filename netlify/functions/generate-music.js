// HALO — Music library via Mubert API v3. Generates a track, downloads it,
// caches it in Supabase storage, and records it. Service-role + passcode gated.
// Requires Netlify env vars: MUBERT_CUSTOMER_ID, MUBERT_ACCESS_TOKEN.
import { createClient } from "@supabase/supabase-js";

// Mood -> Mubert generation params. Adjust `prompt` / `playlist_index` to taste
// (playlist codes come from your Mubert dashboard; prompt drives text-to-music).
const MOOD_CFG = {
  elegant:     { playlist_index: "1.0.0", intensity: "medium", prompt: "elegant romantic cinematic piano, weddings, tender strings" },
  celebration: { playlist_index: "1.0.0", intensity: "high",   prompt: "uplifting celebratory pop, party, joyful, quinceanera" },
  worship:     { playlist_index: "1.0.0", intensity: "low",    prompt: "warm worshipful ambient, reverent piano pads, hopeful" },
  corporate:   { playlist_index: "1.0.0", intensity: "medium", prompt: "modern corporate uplifting motivational, clean" },
  cinematic:   { playlist_index: "1.0.0", intensity: "medium", prompt: "emotional cinematic orchestral swell, inspiring" },
  acoustic:    { playlist_index: "1.0.0", intensity: "low",    prompt: "warm acoustic guitar, gentle heartfelt folk" },
};

function findAudioUrl(obj) {
  const out = [];
  const walk = (o) => {
    if (!o) return;
    if (typeof o === "string") { if (/^https?:\/\/.+\.(mp3|wav)(\?|$)/i.test(o)) out.push(o); return; }
    if (Array.isArray(o)) o.forEach(walk);
    else if (typeof o === "object") Object.values(o).forEach(walk);
  };
  walk(obj);
  return out[0] || null;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, action, mood, id, active, count } = b;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (action === "list") {
      const { data, error } = await supabase.from("music_library").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true, rows: data || [] }) };
    }
    if (action === "toggle") {
      const { error } = await supabase.from("music_library").update({ active: !!active }).eq("id", id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    if (action === "remove") {
      const { data: row } = await supabase.from("music_library").select("storage_path").eq("id", id).single();
      if (row && row.storage_path) await supabase.storage.from("halo").remove([row.storage_path]);
      const { error } = await supabase.from("music_library").delete().eq("id", id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    // generate
    const cfg = MOOD_CFG[mood];
    if (!cfg) return { statusCode: 400, body: JSON.stringify({ error: "Unknown mood" }) };
    const CID = process.env.MUBERT_CUSTOMER_ID, TOK = process.env.MUBERT_ACCESS_TOKEN;
    if (!CID || !TOK) return { statusCode: 500, body: JSON.stringify({ error: "Mubert credentials not set. Add MUBERT_CUSTOMER_ID and MUBERT_ACCESS_TOKEN in Netlify env." }) };

    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 2);
    const made = [];
    for (let i = 0; i < n; i++) {
      const res = await fetch("https://music-api.mubert.com/api/v3/public/tracks", {
        method: "POST",
        headers: { "customer-id": CID, "access-token": TOK, "Content-Type": "application/json" },
        body: JSON.stringify({ playlist_index: cfg.playlist_index, prompt: cfg.prompt, duration: 90, bitrate: 128, format: "mp3", intensity: cfg.intensity, mode: "track" }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(`Mubert ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
      const url = findAudioUrl(j);
      if (!url) throw new Error(`No track URL in Mubert response: ${JSON.stringify(j).slice(0, 400)}`);
      const audio = await fetch(url);
      const buf = Buffer.from(await audio.arrayBuffer());
      const path = `music/library/${mood}-${Date.now()}-${i}.mp3`;
      const up = await supabase.storage.from("halo").upload(path, buf, { contentType: "audio/mpeg", upsert: true });
      if (up.error) throw up.error;
      const { data, error } = await supabase.from("music_library").insert({ mood, title: `${mood} ${new Date().toISOString().slice(0, 10)}`, storage_path: path, source: "mubert", active: true }).select().single();
      if (error) throw error;
      made.push(data);
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true, rows: made }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
