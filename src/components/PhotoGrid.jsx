import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

function Heart({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
      style={{ display: "block" }}
      fill={filled ? C.gold : "none"} stroke={filled ? C.gold : C.white} strokeWidth="2">
      <path d="M12 21s-7.5-4.6-10-9.2C.7 9 1.6 5.6 4.6 4.7 6.7 4 8.8 4.9 12 8c3.2-3.1 5.3-4 7.4-3.3 3 .9 3.9 4.3 2.6 7.1C19.5 16.4 12 21 12 21z" />
    </svg>
  );
}

// `prefer` = "edited" | "original". When `onLike` is provided, a heart appears.
export function PhotoGrid({ photos, dimUnkept = true, min = 150, prefer = "edited", counts = {}, liked, onLike }) {
  const { t } = useI18n();
  const likedSet = liked || new Set();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14, marginTop: 16 }}>
      {photos.map((p) => {
        const hasEdit = !!p.edited_url;
        const showEdited = prefer === "edited" && hasEdit;
        const src = showEdited ? p.edited_url : p.url;
        const pending = p.status === "pending";
        const n = counts[p.id] || 0;
        const isLiked = likedSet.has(p.id);
        return (
          <figure key={p.id} className="card" style={{ margin: 0, background: C.white, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(22,41,76,.08)", opacity: dimUnkept && !p.kept ? 0.55 : 1 }}>
            <div style={{ position: "relative" }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: min, objectFit: "cover", display: "block", filter: pending ? "blur(6px)" : "none" }} />
              <span style={{ position: "absolute", top: 8, right: 8, background: p.kept ? C.gold : C.second, color: C.ink, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.quality}</span>
              {showEdited && !pending && (
                <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5 }}>{t("grid.edited")}</span>
              )}
              {pending && (
                <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5 }}>{t("grid.pending")}</span>
              )}
              {p.is_burst_dup && !pending && (
                <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(22,41,76,.85)", color: C.bg, fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>{t("grid.duplicate")}</span>
              )}
              {!p.kept && !pending && !p.is_burst_dup && (
                <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(22,41,76,.85)", color: C.bg, fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>{t("grid.belowThreshold")}</span>
              )}
              {onLike && !pending && (
                <button type="button" onClick={() => onLike(p.id)} aria-label={t("react.heart")} aria-pressed={isLiked}
                  style={{ position: "absolute", bottom: 8, right: 8, display: "flex", alignItems: "center", gap: 5, background: "rgba(22,41,76,.6)", border: "none", borderRadius: 999, padding: "5px 9px", cursor: "pointer", backdropFilter: "blur(4px)" }}>
                  <Heart filled={isLiked} />
                  {n > 0 && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>{n}</span>}
                </button>
              )}
            </div>
            <figcaption style={{ padding: "8px 10px", fontSize: 11, color: C.second, display: "flex", justifyContent: "space-between" }}>
              <span>{t("grid.focus")} {p.focus}</span><span>{t("grid.exp")} {p.exposure}</span>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
