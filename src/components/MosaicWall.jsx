import React, { useEffect, useRef, useState } from "react";
import { publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { createMosaic, mosaicPhotos, prepareThumbs, readyThumbs, onThumbs } from "../lib/mosaic.js";

// Live wall photo mosaic (Manage > Extras > Photo mosaic). When the event's
// switch is off, the hook does nothing at all: no timers, no image loads,
// no canvas.
export const MOSAIC_EVERY = 10 * 60 * 1000; // same rhythm as Shot of the night...
export const MOSAIC_FIRST = 5 * 60 * 1000;  // ...but offset by 5 min so they never collide
export const MOSAIC_HOLD = 15000;

// The big picture: the cover photo (with its focus point), or if there is no
// cover, the most-hearted photo, or the first one.
export function mosaicTarget(event, photos, counts) {
  if (event && event.cover_path) {
    return { url: publicUrl(event.cover_path), fx: Number.isFinite(event.cover_focus_x) ? event.cover_focus_x : 0.5, fy: Number.isFinite(event.cover_focus_y) ? event.cover_focus_y : 0.5 };
  }
  const list = mosaicPhotos(photos);
  if (!list.length) return null;
  let best = list[0], bestN = 0;
  if (counts) list.forEach((p) => { const n = counts[p.id] || 0; if (n > bestN) { bestN = n; best = p; } });
  return { url: best.url, fx: 0.5, fy: 0.42 };
}

export function useLiveMosaic(event, photos) {
  const on = !!(event && event.mosaic_enabled);
  const [open, setOpen] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const hideRef = useRef(null);

  function show() {
    if (!on) return;
    setOpen(true);
    clearTimeout(hideRef.current);
    hideRef.current = setTimeout(() => setOpen(false), MOSAIC_HOLD);
  }
  function close() { clearTimeout(hideRef.current); setOpen(false); }
  const toggle = () => (open ? close() : show());

  // Make thumbnails quietly in the background, so the card is ready when it
  // opens. Starts 15 s after the wall loads (let the first slides load
  // first) and tops up a few seconds after new photos arrive.
  const started = useRef(false);
  useEffect(() => {
    if (!on) return;
    const go = () => { started.current = true; prepareThumbs(mosaicPhotos(photosRef.current)); };
    const tmr = setTimeout(go, started.current ? 4000 : 15000);
    return () => clearTimeout(tmr);
  }, [on, photos.length]);

  // Every 10 minutes (first at 5), show the mosaic for 15 seconds. Set up
  // once: photo syncs don't restart the clock.
  const showRef = useRef(show);
  showRef.current = show;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    if (!on) return;
    let every = null;
    const first = setTimeout(() => {
      if (photosRef.current.length) showRef.current();
      every = setInterval(() => { if (photosRef.current.length) showRef.current(); }, MOSAIC_EVERY);
    }, MOSAIC_FIRST);
    // "M" on a keyboard or TV remote shows it on demand too.
    const onKey = (e) => { if (e.key && e.key.toLowerCase() === "m" && !e.metaKey && !e.ctrlKey && !e.altKey) toggleRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(first); clearInterval(every); clearTimeout(hideRef.current); window.removeEventListener("keydown", onKey); };
  }, [on]);

  return { on, open, show, close, toggle };
}

export function MosaicIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" style={{ width: size, height: size, flex: "0 0 auto" }}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" fill="currentColor" />
    </svg>
  );
}

// The canvas itself, used by the live wall card and the Manage preview.
export function MosaicCanvas({ target, photos, seed, onStats, style, maxDpr }) {
  const ref = useRef(null);
  const listRef = useRef([]);
  listRef.current = mosaicPhotos(photos);
  const mRef = useRef(null);
  const n = listRef.current.length;

  useEffect(() => {
    const cv = ref.current;
    if (!cv || !target) return;
    const m = createMosaic(cv, { targetUrl: target.url, focusX: target.fx, focusY: target.fy, seed, onStats, maxDpr });
    mRef.current = m;
    let tmr = null;
    const push = () => { tmr = null; m.update(readyThumbs(listRef.current)); };
    push();
    const off = onThumbs(() => { if (!tmr) tmr = setTimeout(push, 500); });
    prepareThumbs(listRef.current);
    return () => { off(); clearTimeout(tmr); m.destroy(); mRef.current = null; };
  }, [target && target.url, seed]); // eslint-disable-line react-hooks/exhaustive-deps

  // New photos while it's open: queue their thumbnails (they animate in).
  useEffect(() => { if (mRef.current) prepareThumbs(listRef.current); }, [n]);

  return <canvas ref={ref} aria-hidden="true" style={{ display: "block", width: "100%", height: "100%", ...style }} />;
}

// Full-screen card on the live wall.
export function MosaicCard({ event, photos, counts, onClose }) {
  const { t } = useI18n();
  const [target] = useState(() => mosaicTarget(event, photos, counts));
  const [used, setUsed] = useState(0);
  return (
    <div id="halo-mosaic" onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 6, background: "var(--ink, #0a0410)", animation: "fadeIn .9s ease", cursor: "pointer" }}>
      <MosaicCanvas target={target} photos={photos} seed={String(event && event.id)} onStats={(s) => setUsed(s.used)} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "6vh 4vw 4.5vh", background: "linear-gradient(to top, rgba(10,4,16,.85), rgba(10,4,16,0))", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ color: C.gold, fontSize: "max(1vw, 11px)", fontWeight: 800, letterSpacing: ".35em", textTransform: "uppercase" }}>{t("mosaic.eyebrow")}</div>
        <div className="serif" style={{ color: "#fff", fontSize: "max(2.6vw, 20px)", fontWeight: 700, lineHeight: 1.15, marginTop: ".4vw", textShadow: "0 2px 18px rgba(0,0,0,.5)" }}>
          {used > 0 ? (used === 1 ? t("mosaic.madeFromOne") : t("mosaic.madeFrom").replace("{n}", used)) : t("mosaic.gathering")}
        </div>
      </div>
    </div>
  );
}
