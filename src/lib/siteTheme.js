// HALO site theme: the accent colours picked in Admin > Site Appearance.
// The homepage, the auth pages and the dashboard all read the same setting,
// cached in localStorage under "halo_theme" so it shows instantly.
import { useEffect, useState } from "react";

// Keep in sync with public/landing/css/halo.css.
export const THEMES = {
  midnight: { a: "#ffb86b", a2: "#ffd9a8", on: "#1a0b04" },
  blush:    { a: "#c98a6a", a2: "#e8b4c4", on: "#fffaf4" },
  obsidian: { a: "#ff2d9b", a2: "#36e3ff", on: "#05010a" },
  emerald:  { a: "#d9b86a", a2: "#f0dca6", on: "#0a1c13" },
  sunset:   { a: "#ff9e6b", a2: "#ffd0a0", on: "#2a160d" },
  plum:     { a: "#c9a0ff", a2: "#e4cfff", on: "#1b0f2a" },
  ivory:    { a: "#d4ad45", a2: "#f0dca6", on: "#17150f" },
  sapphire: { a: "#e7c56b", a2: "#9fc4ff", on: "#0a142b" },
  rosegold: { a: "#d98d98", a2: "#e6bf8a", on: "#2e2426" },
  onyx:     { a: "#f0a830", a2: "#ffd98a", on: "#241803" },
};

function readCachedTheme() {
  try { const t = localStorage.getItem("halo_theme"); return THEMES[t] ? t : null; } catch { return null; }
}

export function useSiteTheme() {
  const [theme, setTheme] = useState(() => readCachedTheme() || "midnight");
  useEffect(() => {
    let alive = true;
    fetch("/.netlify/functions/site-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !THEMES[d.theme]) return;
        setTheme(d.theme);
        try { localStorage.setItem("halo_theme", d.theme); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return THEMES[theme];
}
