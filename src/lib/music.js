// HALO music library: occasions, and the default track for each event type.
// Keep MOODS in step with netlify/functions/music-library.js.
export const MOODS = ["romantic", "elegant", "worship", "celebration", "latin", "cinematic", "uplifting", "corporate", "acoustic"];

// Event category -> the occasion HALO picks when the host chose "Auto".
export const CATEGORY_MOOD = {
  wedding: "romantic", quinceanera: "elegant", church: "worship",
  corporate: "corporate", gala: "elegant", other: "cinematic",
};

export function fmtDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Pick the library track for an event set to "Auto".
export function autoTrack(event, tracks) {
  const active = (tracks || []).filter((x) => x.active !== false);
  if (!active.length) return null;
  const mood = CATEGORY_MOOD[event && event.category] || "cinematic";
  return active.find((x) => x.mood === mood) || active.find((x) => x.mood === "cinematic") || active[0];
}
