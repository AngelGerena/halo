import React, { useEffect, useState } from "react";
import { renderFramed } from "../lib/frames.js";
import { useI18n } from "../lib/i18n.jsx";

// Full-screen view of one guest photo with the event's frame drawn on it,
// plus a Save / Share button. Uses the phone's share sheet when it can take
// a file (iPhone: "Save Image", Instagram, Messages...), otherwise offers a
// download. If the frame can't be drawn, the plain photo is shown instead.
export default function FramedViewer({ photo, frame, eventCode, onClose }) {
  const { t } = useI18n();
  const [state, setState] = useState({ status: "loading", blob: null, url: null });
  const src = photo.edited_url || photo.url;
  const frameKey = JSON.stringify(frame); // parent re-renders pass a new object; only redraw on real changes

  useEffect(() => {
    let alive = true, made = null;
    renderFramed(src, frame)
      .then((blob) => { if (!alive) return; made = URL.createObjectURL(blob); setState({ status: "ready", blob, url: made }); })
      .catch(() => { if (alive) setState({ status: "plain", blob: null, url: src }); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [src, frameKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);

  const fileName = `HALO-${eventCode || "photo"}-${String(photo.id || "").slice(0, 8)}.jpg`;
  const file = state.blob ? new File([state.blob], fileName, { type: "image/jpeg" }) : null;
  const canShareFile = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
  const [hint, setHint] = useState("");

  async function share() {
    if (!file) return;
    if (canShareFile) {
      try { await navigator.share({ files: [file] }); } catch { /* closed the sheet */ }
      return;
    }
    // Desktop / older browsers: download the framed photo.
    const a = document.createElement("a");
    a.href = state.url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
    setHint(t("frame.saved"));
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("frame.viewer")} onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,2,8,.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14,
        padding: "calc(16px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))" }}>
      <button type="button" onClick={onClose} aria-label={t("grid.close")}
        style={{ position: "absolute", top: "calc(12px + env(safe-area-inset-top, 0px))", right: "max(12px, env(safe-area-inset-right, 0px))", width: 44, height: 44, display: "grid", placeItems: "center", background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", borderRadius: 999, cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(100%, 520px, calc((100dvh - 170px) * 0.8))", aspectRatio: state.status === "plain" ? "auto" : "4 / 5", display: "grid", placeItems: "center" }}>
        {state.status === "loading" ? (
          <div role="status" style={{ color: "rgba(255,255,255,.75)", fontSize: 14 }}>{t("frame.preparing")}</div>
        ) : (
          <img src={state.url} alt="" style={{ width: "100%", height: "auto", maxHeight: "calc(100dvh - 170px)", objectFit: "contain", borderRadius: 6, boxShadow: "0 20px 60px rgba(0,0,0,.6)", display: "block" }} />
        )}
      </div>
      {state.status !== "loading" && (
        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: 420, textAlign: "center" }}>
          {state.status === "ready" ? (
            <button type="button" onClick={share}
              style={{ minHeight: 48, padding: "0 26px", borderRadius: 999, border: "none", background: "var(--gold, #ec4899)", color: "var(--ink, #0a0410)", fontSize: 16, fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
              {t("frame.saveShare")}
            </button>
          ) : null}
          <span style={{ color: "rgba(255,255,255,.7)", fontSize: 12.5 }}>{hint || (state.status === "ready" && canShareFile ? t("frame.tipShare") : t("frame.tipHold"))}</span>
        </div>
      )}
    </div>
  );
}
