import React, { useState, useEffect } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import FramedViewer from "./FramedViewer.jsx";

function Thumb({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
      style={{ display: "block" }}
      fill={filled ? C.gold : "none"} stroke={filled ? C.gold : C.white} strokeWidth="2" strokeLinejoin="round">
      <path d="M7 11v10H3V11h4zm3 10h7.5a2.5 2.5 0 0 0 2.4-1.8l1.8-6.4A2 2 0 0 0 19.8 10H14l.9-4.3A1.6 1.6 0 0 0 13.3 4c-.5 0-1 .3-1.3.7L7 11" />
    </svg>
  );
}

function Heart({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
      style={{ display: "block" }}
      fill={filled ? C.gold : "none"} stroke={filled ? C.gold : C.white} strokeWidth="2">
      <path d="M12 21s-7.5-4.6-10-9.2C.7 9 1.6 5.6 4.6 4.7 6.7 4 8.8 4.9 12 8c3.2-3.1 5.3-4 7.4-3.3 3 .9 3.9 4.3 2.6 7.1C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

// `prefer` = "edited" | "original". When `onLike(photoId, kind)` is provided, heart and
// thumbs-up buttons appear. `kinds` = {photoId: {heart, like}}, `liked` = Set("photoId:kind").
function PlayBadge() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" style={{ display: "block", filter: "drop-shadow(0 3px 10px rgba(0,0,0,.45))" }}>
      <circle cx="22" cy="22" r="21" fill="rgba(10,4,16,.55)" stroke="rgba(255,255,255,.85)" strokeWidth="1.5" />
      <path d="M18 14.5v15l12-7.5z" fill="#fff" />
    </svg>
  );
}

// Full-screen player for a guest's clip, with sound (they tapped it).
function ClipPlayer({ photo, onClose }) {
  const { t } = useI18n();
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,2,8,.94)", display: "grid", placeItems: "center", padding: 16 }}>
      <video src={photo.video_url} poster={photo.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "86vh", borderRadius: 14, background: "#000", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }} />
      <button type="button" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", borderRadius: 999, padding: "8px 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{t("grid.close")}</button>
    </div>
  );
}

// `frame` (from frameFor(event)): when set, tapping a photo opens it with the
// event's frame and a Save / Share button. Without it the grid behaves as before.
export function PhotoGrid({ photos, dimUnkept = true, min = 150, prefer = "edited", kinds = {}, liked, onLike, frame = null, eventCode = "" }) {
  const { t } = useI18n();
  const likedSet = liked || new Set();
  const [playing, setPlaying] = useState(null);
  const [viewing, setViewing] = useState(null);
  return (
    <>
    {playing && <ClipPlayer photo={playing} onClose={() => setPlaying(null)} />}
    {viewing && frame && <FramedViewer photo={viewing} frame={frame} eventCode={eventCode} onClose={() => setViewing(null)} />}
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14, marginTop: 16 }}>
      {photos.map((p) => {
        const hasEdit = !!p.edited_url;
        const showEdited = prefer === "edited" && hasEdit;
        const src = showEdited ? p.edited_url : p.url;
        const pending = p.status === "pending";
        const k = kinds[p.id] || {};
        const nHeart = k.heart || 0, nLike = k.like || 0;
        const isLiked = likedSet.has(`${p.id}:heart`), isThumbed = likedSet.has(`${p.id}:like`);
        return (
          <figure key={p.id} className="card" style={{ margin: 0, background: C.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line}`, opacity: dimUnkept && !p.kept ? 0.55 : 1 }}>
            <div style={{ position: "relative" }}>
              {frame && !p.video_url && !pending ? (
                <button type="button" onClick={() => setViewing(p)} aria-label={t("frame.open")}
                  style={{ display: "block", width: "100%", padding: 0, border: "none", background: "none", cursor: "zoom-in" }}>
                  <img src={src} alt="" loading="lazy" style={{ width: "100%", height: min, objectFit: "cover", display: "block" }} />
                </button>
              ) : (
                <img src={src} alt="" loading="lazy" style={{ width: "100%", height: min, objectFit: "cover", display: "block", filter: pending ? "blur(6px)" : "none" }} />
              )}
              {p.video_url && !pending && (
                <button type="button" onClick={() => setPlaying(p)} aria-label={t("grid.playVideo")}
                  style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
                  <PlayBadge />
                  {p.duration ? <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.65)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>0:{String(Math.round(p.duration)).padStart(2, "0")}</span> : null}
                </button>
              )}
              {/* Guest-facing grid: no scores or internals. One friendly tag at most. */}
              {p.kept && !pending && (
                <span style={{ position: "absolute", top: 8, left: 8, background: C.gold, color: C.ink, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, letterSpacing: 0.4 }}>{t("grid.pick")}</span>
              )}
              {pending && (
                <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5 }}>{t("grid.pending")}</span>
              )}
              {p.is_burst_dup && !pending && (
                <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(0,0,0,.72)", color: C.text, fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>{t("grid.duplicate")}</span>
              )}
              {onLike && !pending && (
                <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => onLike(p.id, "heart")} aria-label={t("react.heart")} aria-pressed={isLiked}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.55)", border: "none", borderRadius: 999, padding: "5px 9px", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                    <Heart filled={isLiked} />
                    {nHeart > 0 && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>{nHeart}</span>}
                  </button>
                  <button type="button" onClick={() => onLike(p.id, "like")} aria-label={t("react.like")} aria-pressed={isThumbed}
                    style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.55)", border: "none", borderRadius: 999, padding: "5px 9px", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                    <Thumb filled={isThumbed} />
                    {nLike > 0 && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>{nLike}</span>}
                  </button>
                </div>
              )}
            </div>
          </figure>
        );
      })}
    </div>
    </>
  );
}
