import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

// `prefer` = "edited" | "original" — which version to display when both exist.
export function PhotoGrid({ photos, dimUnkept = true, min = 150, prefer = "edited" }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill,minmax(${min}px,1fr))`, gap: 14, marginTop: 16 }}>
      {photos.map((p) => {
        const hasEdit = !!p.edited_url;
        const showEdited = prefer === "edited" && hasEdit;
        const src = showEdited ? p.edited_url : p.url;
        return (
          <figure key={p.id} className="card" style={{ margin: 0, background: C.white, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(28,38,64,.08)", opacity: dimUnkept && !p.kept ? 0.55 : 1 }}>
            <div style={{ position: "relative" }}>
              <img src={src} alt="" loading="lazy" style={{ width: "100%", height: min, objectFit: "cover", display: "block" }} />
              <span style={{ position: "absolute", top: 8, right: 8, background: p.kept ? C.gold : C.second, color: C.ink, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.quality}</span>
              {showEdited && (
                <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: 0.5 }}>{t("grid.edited")}</span>
              )}
              {!p.kept && (
                <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(28,38,64,.85)", color: C.bg, fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>{t("grid.belowThreshold")}</span>
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
