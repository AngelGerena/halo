import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../lib/i18n.jsx";
import { renderFramed } from "../../lib/frames.js";
import { fetchBytes, saveBlob } from "../../lib/zipDownload.js";
import { exportBoomerang } from "../../lib/boomerang.js";
import { shareLink } from "../../lib/share.js";
import BoomerangPlayer from "../BoomerangPlayer.jsx";
import AlbumReactions from "./AlbumReactions.jsx";

// HALO Album: one photo full screen. Swipe or use the arrows to move through
// every photo, Save puts it on the phone, Share sends the actual photo (with
// the event frame) to Instagram, WhatsApp, Facebook, Messages...
//
// Phones only open the share sheet straight from a tap, so the file for the
// photo on screen is made as soon as it shows; the tap then just hands it
// over. Boomerangs take a few seconds to turn into a video, so for those the
// first tap prepares and the second saves (same as the guest page).

const isIOS = () => typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const canShareFile = (f) => { try { return !!(f && navigator.canShare && navigator.canShare({ files: [f] })); } catch { return false; } };

export default function AlbumViewer({ items, index, onIndex, onClose, frame, slug, albumLink, albumTitle, onSlideshow, hearts = null }) {
  const { t } = useI18n();
  const item = items[index];
  const total = items.length;
  const [ready, setReady] = useState({ id: null, file: null, status: "idle" }); // idle | preparing | ready | error
  const [note, setNote] = useState("");
  const noteT = useRef(null);
  const flash = (m) => { setNote(m); clearTimeout(noteT.current); noteT.current = setTimeout(() => setNote(""), 2600); };

  const step = useCallback((d) => onIndex((index + d + total) % total), [index, total, onIndex]);

  // keyboard + no page scroll behind
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose, step]);

  // preload the neighbours so swiping feels instant
  useEffect(() => {
    [1, -1].forEach((d) => {
      const n = items[(index + d + total) % total];
      if (n && !n.video_url && n.kind !== "boomerang") { const im = new Image(); im.src = n.edited_url || n.url; }
    });
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const fileName = (ext) => `${slug || "HALO"}_${String(index + 1).padStart(3, "0")}.${ext}`;

  // make the file for the photo on screen
  useEffect(() => {
    let alive = true;
    setReady({ id: item?.id, file: null, status: "idle" });
    if (!item || item.kind === "boomerang") return () => { alive = false; };
    setReady({ id: item.id, file: null, status: "preparing" });
    (async () => {
      try {
        let file;
        if (item.video_url) {
          const ext = (String(item.video_path || "").match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1];
          const bytes = await fetchBytes(item.video_url);
          file = new File([bytes], fileName(ext), { type: ext === "webm" ? "video/webm" : ext === "mov" ? "video/quicktime" : "video/mp4" });
        } else {
          const src = item.edited_url || item.url;
          let blob = null;
          if (frame) { try { blob = await renderFramed(src, frame); } catch { blob = null; } }
          if (!blob) blob = new Blob([await fetchBytes(src)], { type: "image/jpeg" });
          file = new File([blob], fileName("jpg"), { type: "image/jpeg" });
        }
        if (alive) setReady({ id: item.id, file, status: "ready" });
      } catch {
        if (alive) setReady({ id: item.id, file: null, status: "error" });
      }
    })();
    return () => { alive = false; };
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function prepareBoomerang() {
    setReady({ id: item.id, file: null, status: "preparing" });
    try {
      const file = await exportBoomerang(item.url, item.loop_frames, { name: fileName("x").replace(/\.x$/, "") });
      setReady({ id: item.id, file, status: "ready" });
      return true;
    } catch { setReady({ id: item.id, file: null, status: "error" }); return false; }
  }

  async function onSave(e) {
    e.stopPropagation();
    if (ready.status === "preparing") { flash(t("alb.preparing")); return; }
    if (!ready.file) {
      if (item.kind === "boomerang" && await prepareBoomerang()) flash(t("alb.tapAgain"));
      else if (item.kind !== "boomerang") flash(t("alb.saveFailed"));
      return;
    }
    const file = ready.file;
    // iPhone: the share sheet is the only way into Photos ("Save Image").
    if (isIOS() && canShareFile(file)) {
      try { await navigator.share({ files: [file] }); } catch { /* closed the sheet */ }
      return;
    }
    try { saveBlob(file, file.name); flash(t("alb.saved")); } catch { flash(t("alb.saveFailed")); }
  }

  async function onShare(e) {
    e.stopPropagation();
    if (ready.status === "preparing") { flash(t("alb.preparing")); return; }
    if (!ready.file && item.kind === "boomerang") {
      if (await prepareBoomerang()) flash(t("alb.tapAgainShare"));
      return;
    }
    if (ready.file && canShareFile(ready.file)) {
      try { await navigator.share({ files: [ready.file] }); } catch { /* closed the sheet */ }
      return;
    }
    // Computers and older phones can't share a file: share the album link.
    const r = await shareLink({ url: albumLink, title: albumTitle, text: t("alb.shareText").replace("{name}", albumTitle) });
    if (r === "copied") flash(t("alb.linkShared"));
    else if (r === "failed") flash(t("alb.copyFailed"));
  }

  // swipe
  const touch = useRef(null);
  function onTouchStart(e) {
    if (e.touches.length !== 1) { touch.current = null; return; }
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onTouchEnd(e) {
    const s = touch.current; touch.current = null;
    if (!s || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) step(dx < 0 ? 1 : -1);
  }

  if (!item) return null;
  const busy = ready.status === "preparing";

  return (
    <div role="dialog" aria-modal="true" aria-label={t("alb.viewer")} className="albv"
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="albv-top">
        <button type="button" className="albv-round" onClick={onClose} aria-label={t("alb.close")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <span className="albv-count" aria-live="polite">{t("alb.of").replace("{n}", index + 1).replace("{total}", total)}</span>
        <span style={{ width: 44 }} />
      </div>

      <div className="albv-stage">
        {item.video_url ? (
          <video key={item.id} src={item.video_url} poster={item.url} controls playsInline className="albv-media" />
        ) : item.kind === "boomerang" ? (
          <div className="albv-boom"><BoomerangPlayer key={item.id} src={item.url} frames={item.loop_frames} fit="contain" style={{ width: "100%", height: "100%" }} /></div>
        ) : (
          <img key={item.id} src={item.edited_url || item.url} alt="" className="albv-media" draggable="false" />
        )}
        {total > 1 && (
          <>
            <button type="button" className="albv-nav l" onClick={() => step(-1)} aria-label={t("alb.prev")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <button type="button" className="albv-nav r" onClick={() => step(1)} aria-label={t("alb.next")}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </>
        )}
      </div>

      {hearts && <div style={{ paddingTop: 8 }}><AlbumReactions photoId={item.id} hearts={hearts} variant="viewer" /></div>}
      <div className="albv-note" role="status">{note || (total > 1 ? t("alb.swipe") : "")}</div>

      <div className="albv-bar">
        <button type="button" className="albv-act" id="albv-save" onClick={onSave} aria-busy={busy}>
          <span className="i">{busy ? <span className="spin albv-spin" /> : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
          )}</span>{t("alb.save")}
        </button>
        <button type="button" className="albv-act hot" id="albv-share" onClick={onShare} aria-busy={busy}>
          <span className="i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg></span>{t("alb.shareOne")}
        </button>
        <button type="button" className="albv-act" id="albv-show" onClick={(e) => { e.stopPropagation(); onSlideshow(index); }}>
          <span className="i"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg></span>{t("alb.slideshow")}
        </button>
      </div>
    </div>
  );
}
