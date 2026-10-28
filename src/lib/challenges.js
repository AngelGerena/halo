// HALO — photo challenges. Little prompts guests tap to take a specific shot.
// They pull quiet guests in and give the live wall variety.
//
// events.challenges (jsonb):
//   null      -> use DEFAULT_CHALLENGES
//   []        -> challenges turned off
//   [{ id, en, es }] -> the host's own list
// photos.challenge holds the id the photo answers.

export const DEFAULT_CHALLENGES = [
  { id: "stars",   en: "A selfie with the stars of the night", es: "Una selfie con los protagonistas de la noche" },
  { id: "dance",   en: "The best dance move", es: "El mejor paso de baile" },
  { id: "laugh",   en: "Someone laughing out loud", es: "Alguien riéndose a carcajadas" },
  { id: "table",   en: "Your whole table, all together", es: "Toda tu mesa junta" },
  { id: "ages",    en: "The oldest and youngest guest together", es: "El invitado mayor y el más pequeño juntos" },
  { id: "toast",   en: "A toast!", es: "¡Un brindis!" },
  { id: "details", en: "The details: flowers, cake, decor", es: "Los detalles: flores, pastel, decoración" },
  { id: "candid",  en: "A moment nobody posed for", es: "Un momento natural, sin posar" },
];

export function challengesFor(event) {
  if (!event) return [];
  const c = event.challenges;
  if (c == null) return DEFAULT_CHALLENGES;
  return Array.isArray(c) ? c.filter((x) => x && x.id && (x.en || x.es)) : [];
}

export const challengeText = (c, lang) => (c ? (lang === "es" ? (c.es || c.en) : (c.en || c.es)) : "");

// Host editor: one challenge per line -> [{id, en, es}] (same text both languages).
export function parseChallengeLines(text) {
  return String(text || "")
    .split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 20)
    .map((line, i) => {
      const hit = DEFAULT_CHALLENGES.find((d) => d.en === line || d.es === line);
      return hit || { id: "c" + (i + 1) + "-" + line.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12), en: line, es: line };
    });
}
