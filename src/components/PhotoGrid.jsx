import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

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
export function PhotoGrid({ photos, dimUnkept = true, min = 150, prefer = "edited", kinds = {}, liked, onLike }) {
  const { t } = useI18n();
  const likedSet = liked || new Set();
  return (
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
          <figure key={p.id} className="card" style={{ margin: 0, background: C.card, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.1)", opacity: dimUnkept && !p.kept ? 0.55 : 1 }}>
            <div style={{ position: "relative" }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: min, objectFit: "cover", display: "block", filter: pending ? "blur(6px)" : "none" }} />
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
  );
}
