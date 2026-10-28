// HALO — per-event looks: the ten palettes from the site theme switcher, with
// the full token set the guest page and live screen need. Light looks flip
// the surface tint (--tint), field shade (--shade) and page colour (--page)
// so panels, borders and inputs read correctly on a light background.
// applyLook() sets CSS variables on <html>; clearLook() restores the default.
export const LOOKS = [
  { key: "midnight", name: "Midnight Champagne", gold: "#ffb86b", goldLight: "#ffd9a8", pink: "#ff3d81", bg: "#06030b", ink: "#0a0410", panel: "#140a20", panel2: "#1a1020", text: "#ffffff", second: "#b9b2c4", light: false },
  { key: "blush",    name: "Blush Editorial",    gold: "#b9775a", goldLight: "#d9a88f", pink: "#b56a7f", bg: "#f6efe8", ink: "#2b2320", panel: "#ffffff", panel2: "#fbf4ec", text: "#2b2320", second: "#6f645c", light: true },
  { key: "obsidian", name: "Obsidian Neon",      gold: "#ff2d9b", goldLight: "#ff7cc0", pink: "#36e3ff", bg: "#000000", ink: "#050505", panel: "#121212", panel2: "#181818", text: "#ffffff", second: "#b3b3b3", light: false },
  { key: "emerald",  name: "Emerald Noir",       gold: "#d9b86a", goldLight: "#ecd59e", pink: "#2fa37a", bg: "#05110d", ink: "#071610", panel: "#0e2119", panel2: "#12291f", text: "#ffffff", second: "#aebdb5", light: false },
  { key: "sunset",   name: "Sunset Warmth",      gold: "#ff9e6b", goldLight: "#ffc7a8", pink: "#ff6b57", bg: "#1a0f0a", ink: "#1f120c", panel: "#2a1912", panel2: "#321e15", text: "#ffffff", second: "#cdb8ad", light: false },
  { key: "plum",     name: "Royal Plum",         gold: "#c9a0ff", goldLight: "#e0c8ff", pink: "#ff7ad1", bg: "#0f0617", ink: "#13081d", panel: "#1d0f2b", panel2: "#241335", text: "#ffffff", second: "#c0b3cf", light: false },
  { key: "ivory",    name: "Ivory & Ink",        gold: "#a8862a", goldLight: "#cdb25f", pink: "#b8566b", bg: "#f3f1ec", ink: "#17150f", panel: "#ffffff", panel2: "#faf7ee", text: "#17150f", second: "#625e53", light: true },
  { key: "sapphire", name: "Sapphire Night",     gold: "#e7c56b", goldLight: "#f3dc9c", pink: "#6ea8ff", bg: "#060b1a", ink: "#080f22", panel: "#0f1a33", panel2: "#14213d", text: "#ffffff", second: "#aeb8cf", light: false },
  { key: "rosegold", name: "Rose Gold Mist",     gold: "#a95f6b", goldLight: "#cf98a1", pink: "#b0864f", bg: "#efe6e4", ink: "#2e2426", panel: "#ffffff", panel2: "#f6ebe9", text: "#2e2426", second: "#6f6062", light: true },
  { key: "onyx",     name: "Onyx & Amber",       gold: "#f0a830", goldLight: "#f7c874", pink: "#ff8a3d", bg: "#0c0a08", ink: "#0f0d0a", panel: "#1a1612", panel2: "#211c16", text: "#ffffff", second: "#bdb3a6", light: false },
];
export const DEFAULT_LOOK = "midnight";
export function getLook(key) { return LOOKS.find((l) => l.key === key) || LOOKS[0]; }

const VARS = ["gold", "gold-light", "pink", "bg", "ink", "panel", "panel2", "text", "second", "line", "line2", "on-ink", "tint", "shade", "page", "tabbar"];
export function applyLook(key) {
  const l = getLook(key);
  const r = document.documentElement.style;
  r.setProperty("--gold", l.gold); r.setProperty("--gold-light", l.goldLight); r.setProperty("--pink", l.pink);
  r.setProperty("--bg", l.bg); r.setProperty("--ink", l.ink); r.setProperty("--panel", l.panel); r.setProperty("--panel2", l.panel2);
  r.setProperty("--text", l.text); r.setProperty("--second", l.second);
  r.setProperty("--line", l.light ? "rgba(0,0,0,.1)" : "rgba(255,255,255,.1)");
  r.setProperty("--line2", l.light ? "rgba(0,0,0,.18)" : "rgba(255,255,255,.18)");
  r.setProperty("--on-ink", "#ffffff");
  r.setProperty("--tint", l.light ? "40,28,24" : "255,255,255");   // surfaces/borders: rgba(var(--tint), a)
  r.setProperty("--shade", l.light ? "255,255,255" : "0,0,0");     // input fields: rgba(var(--shade), a)
  r.setProperty("--page", l.light ? l.bg : l.ink);                  // the page background colour
  r.setProperty("--tabbar", l.light ? "rgba(255,255,255,.92)" : l.ink); // guest page bottom tab bar
  document.documentElement.style.colorScheme = l.light ? "light" : "dark";
  document.documentElement.dataset.look = l.key;
}
export function clearLook() {
  const r = document.documentElement.style;
  VARS.forEach((n) => r.removeProperty(`--${n}`));
  r.removeProperty("color-scheme");
  delete document.documentElement.dataset.look;
}
