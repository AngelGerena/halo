import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../lib/i18n.jsx";

// HALO Album slideshow: a slow, full-screen fade through the photos. No
// live-event extras (leaderboard, sponsor breaks, join QR). Tap to pause,
// arrows or swipe to move, Esc or the X to leave.
const HOLD_MS = 4500;

export default function AlbumSlideshow({ photos, start = 0, title, music = null, onClose }) {
  const { t } = useI18n();
  const total = photos.length;
  const [i, setI] = useState(Math.min(Math.max(0, start), Math.max(0, total - 1)));
  const [layers, setLayers] = useState(() => [{ k: 0, i: Math.min(Math.max(0, start), Math.max(0, total - 1)) }]);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef(null);
  const audioRef = useRef(null);
  const [musicOn, setMusicOn] = useState(false);

  // Start the music with the slideshow (it was opened by a tap, so phones
  // usually allow it). If the phone blocks it, the music button starts it.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return undefined;
    a.volume = 0.6;
    a.play().then(() => setMusicOn(true)).catch(() => setMusicOn(false));
    return () => { try { a.pause(); } catch {} };
  }, [music]);
  function toggleMusic(e) {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (musicOn) { a.pause(); setMusicOn(false); }
    else { a.volume = 0.6; a.play().then(() => setMusicOn(true)).catch(() => {}); }
  }

  const go = (d) => setI((n) => (n + d + total) % total);

  // crossfade: keep the outgoing photo underneath while the new one fades in
  useEffect(() => {
    setLayers((ls) => {
      const last = ls[ls.length - 1];
      if (last && last.i === i) return ls;
      return [...ls.slice(-1), { k: (last ? last.k : 0) + 1, i }];
    });
    const n = photos[(i + 1) % total];
    if (n) { const im = new Image(); im.src = n.edited_url || n.url; }
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (paused || total < 2) return undefined;
    const id = setTimeout(() => go(1), HOLD_MS);
    return () => clearTimeout(id);
  }, [i, paused, total]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    // Keep the screen on while it plays, when the phone allows it.
    let lock = null;
    try { navigator.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); } catch {}
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
      try { lock && lock.release(); } catch {}
    };
  }, [onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  const touch = useRef(null);
  const moved = useRef(false);
  function onTouchStart(e) { touch.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; moved.current = false; }
  function onTouchEnd(e) {
    const s = touch.current; touch.current = null;
    if (!s || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { moved.current = true; go(dx < 0 ? 1 : -1); }
  }

  if (!total) return null;
  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={t("alb.slideshow")} className="albs"
      onClick={() => { if (!moved.current) setPaused((p) => !p); moved.current = false; }}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {layers.map((l, n) => {
        const p = photos[l.i];
        return p ? <img key={l.k} src={p.edited_url || p.url} alt="" className={"albs-img" + (n === layers.length - 1 ? " on" : "")} /> : null;
      })}
      {music && <audio ref={audioRef} src={music} loop preload="auto" />}
      <div className="albs-title">{title}</div>
      {music && (
        <button type="button" className={"albv-round albs-music" + (musicOn ? " on" : "")} onClick={toggleMusic}
          aria-pressed={musicOn} aria-label={musicOn ? t("alb.musicOff") : t("alb.musicOn")}>
          {musicOn
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 18V6l11-2v12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /><path d="M3 3l18 18" /></svg>}
        </button>
      )}
      <button type="button" className="albv-round albs-x" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label={t("alb.exit")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      <div className="albs-bar">
        <span role="status">{paused ? t("alb.paused") : t("alb.tapPause")}</span>
        <span>{i + 1} / {total}</span>
      </div>
    </div>
  );
}
