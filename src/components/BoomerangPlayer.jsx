import { corsUrl } from "../lib/corsUrl.js";
// HALO — boomerang playback and capture UI.
//
// <BoomerangPlayer src frames fit fps playing /> draws one frame of the
// sprite sheet at a time onto a canvas, forward then backward on a loop,
// sized like an image (fit = "cover" | "contain"). It pauses itself while
// off screen or while the tab is hidden, so a gallery full of boomerangs
// doesn't drain a phone.
import React, { useEffect, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { spriteGrid, pingPong, BOOM_FPS, makeBoomerang, exportBoomerang, saveFile, isBoomerang } from "../lib/boomerang.js";

export function LoopIcon({ size = 18, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ display: "block", flexShrink: 0 }} {...rest}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12c-2-2.6-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.4 5.5-4Zm0 0c2 2.6 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.4-5.5 4Z" />
    </svg>
  );
}

// Small "this one loops" pill. `compact` = icon only (tight guest tiles).
export function LoopBadge({ label, compact = false, style }) {
  return (
    <span title={label} aria-label={compact ? label : undefined} style={{ position: "absolute", bottom: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,.68)", color: "#fff", fontSize: 10, fontWeight: 800, padding: compact ? 5 : "3px 8px", borderRadius: 999, letterSpacing: 0.4, pointerEvents: "none", ...style }}>
      <LoopIcon size={compact ? 14 : 12} />{compact ? null : <> {label}</>}
    </span>
  );
}

// Load once per URL; try CORS first (lets the canvas be saved), then plain.
function useSprite(src) {
  const [img, setImg] = useState(null);
  useEffect(() => {
    let alive = true;
    setImg(null);
    if (!src) return undefined;
    const load = (cors) => {
      const im = new Image();
      if (cors) im.crossOrigin = "anonymous";
      im.onload = () => { if (alive) setImg(im); };
      im.onerror = () => { if (cors && alive) load(false); };
      im.src = cors ? corsUrl(src) : src;
    };
    load(true);
    return () => { alive = false; };
  }, [src]);
  return img;
}

export default function BoomerangPlayer({ src, frames, fit = "cover", fps = BOOM_FPS, playing = true, style, className, canvasStyle }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const img = useSprite(src);

  useEffect(() => {
    const wrap = wrapRef.current, canvas = canvasRef.current;
    if (!img || !wrap || !canvas) return undefined;
    const { frames: n, cols, rows } = spriteGrid(frames);
    const fw = img.naturalWidth / cols, fh = img.naturalHeight / rows;
    const seq = pingPong(n);
    const ctx = canvas.getContext("2d");
    let step = 0, raf = 0, last = 0, onScreen = true;

    function draw(frame) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(wrap.clientWidth * dpr)), H = Math.max(1, Math.round(wrap.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const ox = (frame % cols) * fw, oy = Math.floor(frame / cols) * fh;
      ctx.clearRect(0, 0, W, H);
      if (fit === "contain") {
        const s = Math.min(W / fw, H / fh);
        const dw = fw * s, dh = fh * s;
        ctx.drawImage(img, ox, oy, fw, fh, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        const s = Math.max(W / fw, H / fh);
        const sw = W / s, sh = H / s;
        ctx.drawImage(img, ox + (fw - sw) / 2, oy + (fh - sh) / 2, sw, sh, 0, 0, W, H);
      }
      wrap.dataset.frame = String(frame);
    }
    draw(seq[0]);

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (!onScreen || now - last < 1000 / fps) return;
      last = now;
      step = (step + 1) % seq.length;
      draw(seq[step]);
    };
    if (playing && seq.length > 1) raf = requestAnimationFrame(tick);

    let io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => { onScreen = entries.some((e) => e.isIntersecting); }, { rootMargin: "100px" });
      io.observe(wrap);
    }
    let ro = null;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(() => draw(seq[step])); ro.observe(wrap); }
    return () => { cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); };
  }, [img, frames, fit, fps, playing]);

  return (
    <div ref={wrapRef} className={className} data-boomerang="" style={{ position: "relative", overflow: "hidden", ...style }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", ...canvasStyle }} />
    </div>
  );
}

// A photo row's picture: the boomerang player for boomerangs, else the image.
// Drop-in for small thumbnails (`style` sizes the box like an <img>).
export function MediaThumb({ photo, src, style, playing = true, ...rest }) {
  if (isBoomerang(photo)) return <BoomerangPlayer src={photo.url} frames={photo.loop_frames} style={style} playing={playing} />;
  return <img src={src || photo.edited_url || photo.url} alt="" style={style} {...rest} />;
}

// Full-screen boomerang with a Save button. Saving is two taps on purpose:
// making the file takes a few seconds, and phones only open the share sheet
// straight from a tap, so the first tap prepares it and the second saves it.
export function BoomerangViewer({ photo, eventCode = "", onClose }) {
  const { t } = useI18n();
  const [state, setState] = useState("idle"); // idle | preparing | ready | error
  const fileRef = useRef(null);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  async function onSave(e) {
    e.stopPropagation();
    if (state === "preparing") return;
    if (state === "ready" && fileRef.current) {
      try { await saveFile(fileRef.current); } catch { setState("error"); }
      return;
    }
    setState("preparing");
    try {
      fileRef.current = await exportBoomerang(photo.url, photo.loop_frames, { name: `HALO_${eventCode || "event"}_boomerang` });
      setState("ready");
    } catch { setState("error"); }
  }
  const btn = { minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "0 20px", fontWeight: 700, fontSize: 15, cursor: "pointer" };
  return (
    <div role="dialog" aria-modal="true" aria-label={t("boom.badge")} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,2,8,.94)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, height: "min(72vh, 760px)" }}>
        <BoomerangPlayer src={photo.url} frames={photo.loop_frames} fit="contain" style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
        <button type="button" id="boom-save" onClick={onSave} disabled={state === "preparing"} style={{ ...btn, background: C.gold, color: C.ink, border: "none", opacity: state === "preparing" ? 0.7 : 1 }}>
          {state === "preparing" ? <span className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(0,0,0,.2)", borderTopColor: C.ink, display: "inline-block" }} /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" /></svg>
          )}
          {state === "preparing" ? t("boom.preparing") : state === "ready" ? t("boom.saveReady") : t("boom.save")}
        </button>
      </div>
      {state === "error" && <div role="alert" style={{ color: "#ff8a80", fontSize: 13, fontWeight: 600 }}>{t("boom.saveError")}</div>}
      <button type="button" onClick={onClose} style={{ position: "absolute", top: 14, right: 14, minHeight: 44, background: "rgba(255,255,255,.12)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", borderRadius: 999, padding: "0 16px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>{t("grid.close")}</button>
    </div>
  );
}

// Guest Add tab: "Boomerang" button next to "Record a video". Opens the phone
// camera in video mode, turns the clip into a sprite on the phone, then hands
// the sprite File to onReady (EventPage sends it through its upload queue).
export function BoomerangButton({ style, onReady, onError }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  async function picked(file) {
    if (!file) return;
    setBusy(true);
    try { onReady(await makeBoomerang(file)); }
    catch (e) { onError && onError(t(e && e.tooShort ? "boom.tooShort" : "boom.unreadable")); }
    finally { setBusy(false); }
  }
  return (
    <>
      <button type="button" id="boom-btn" onClick={() => !busy && ref.current?.click()} aria-busy={busy} style={{ ...style, opacity: busy ? 0.7 : 1 }}>
        {busy ? <span className="spin" style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: "50%", border: "2px solid rgba(var(--tint, 255,255,255),.18)", borderTopColor: C.gold, display: "inline-block" }} /> : <span style={{ color: "var(--gold)", display: "inline-flex" }}><LoopIcon size={19} /></span>}
        {busy ? t("boom.making") : t("boom.button")}
      </button>
      <input ref={ref} type="file" accept="video/*" capture="environment" hidden data-boomerang-input=""
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; picked(f); }} />
    </>
  );
}

// Live wall: the boomerang whole in the middle over a soft blurred copy of
// itself (phone clips are often vertical), fading in like a photo.
export function BoomerangFrame({ src, frames, fading = false }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#000", animation: fading ? "none" : "fadeIn 1s ease", opacity: fading ? 0 : 1, transition: "opacity 1s ease" }}>
      <BoomerangPlayer src={src} frames={frames} playing={false} style={{ position: "absolute", inset: "-6%", width: "112%", height: "112%" }} canvasStyle={{ filter: "blur(28px) brightness(.55)" }} />
      <BoomerangPlayer src={src} frames={frames} fit="contain" playing={!fading} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
