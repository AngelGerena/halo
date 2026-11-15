// HALO guided tour: spotlights one part of the page at a time with a short
// hint card (Back / Next / Skip). Runs once per tour per browser on its own,
// and can be replayed any time with replayTour(id) (the "Take the tour" buttons).
//
// <Tour id="dashboard" steps={[{ target: '[data-tour="create"]', title, body }]} auto />
//   target   CSS selector; steps whose target isn't on the page are skipped.
//            Omit it for a centered welcome card.
//   auto     start by itself the first time (remembered in localStorage)
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { useSiteTheme } from "../lib/siteTheme.js";

const KEY = (id) => `halo_tour_${id}_done`;
const EVT = "halo:tour";
const PAD = 8;

export function tourDone(id) { try { return localStorage.getItem(KEY(id)) === "1"; } catch { return false; } }
function markDone(id) { try { localStorage.setItem(KEY(id), "1"); } catch {} }
export function replayTour(id) { window.dispatchEvent(new CustomEvent(EVT, { detail: { id } })); }

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// "Glow" look: hints use the site theme's SECOND color (cyan on the pink
// Obsidian theme, champagne on Midnight, and so on), so they never look like
// the theme's main-color buttons and always match whatever theme is chosen.
function tourColors(th) {
  const a = (th && th.a2) || "#36e3ff";
  return {
    a,
    card: `color-mix(in srgb, ${a} 7%, #0b0c14)`,
    border: `1px solid color-mix(in srgb, ${a} 70%, transparent)`,
    text: "#ffffff",
    body: "rgba(232,238,248,.78)",
    muted: "rgba(232,238,248,.6)",
    onA: "#06101a",
    backBorder: `1px solid color-mix(in srgb, ${a} 40%, transparent)`,
    dotOff: "rgba(255,255,255,.15)",
  };
}

export default function Tour({ id, steps, auto = false, delay = 700, onFinish }) {
  const { t } = useI18n();
  const K = tourColors(useSiteTheme());
  const [idx, setIdx] = useState(-1); // -1 = not running
  const [rect, setRect] = useState(null);
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  const nextBtn = useRef(null);
  const dir = useRef(1);

  const start = useCallback(() => { dir.current = 1; setIdx(0); }, []);
  const finish = useCallback(() => { setIdx(-1); setRect(null); markDone(id); onFinish && onFinish(); }, [id, onFinish]);

  useEffect(() => {
    if (!auto || tourDone(id)) return;
    const tm = setTimeout(start, delay);
    return () => clearTimeout(tm);
  }, [auto, id, delay, start]);

  useEffect(() => {
    const on = (e) => { if (e.detail && e.detail.id === id) start(); };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [id, start]);

  const step = idx >= 0 ? steps[idx] : null;

  // Steps are read through a ref: the parent re-renders all the time (live
  // photo updates, timers), and that must never re-run the step logic below.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const [ready, setReady] = useState(false); // current step's target found + measured
  const lastMove = useRef(0);

  // Runs once per step change: wait for the target (sections can still be
  // loading), skip it only if it never shows up, then scroll to it and keep the
  // spotlight glued to it while the page moves.
  useLayoutEffect(() => {
    if (idx < 0) return;
    const list = stepsRef.current;
    if (idx >= list.length) { finish(); return; }
    const s = list[idx];
    setReady(false);
    if (!s.target) { setRect(null); setReady(true); return; }

    let cancelled = false, el = null, raf = 0, poll = 0, follow = 0, settle = 0;
    const measure = () => {
      if (!el || !el.isConnected) { el = document.querySelector(s.target); if (!visible(el)) return; }
      const r = el.getBoundingClientRect();
      setRect((prev) => (prev && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5)
        ? prev : { top: r.top, left: r.left, width: r.width, height: r.height });
      setVw(window.innerWidth); setVh(window.innerHeight);
    };
    const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    const begin = () => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      measure(); setReady(true);
      settle = setTimeout(measure, 450);           // after the smooth scroll settles
      follow = setInterval(measure, 400);          // follow layout shifts (images, live updates)
      window.addEventListener("scroll", tick, true);
      window.addEventListener("resize", tick);
    };
    const started = Date.now();
    const look = () => {
      if (cancelled) return;
      el = document.querySelector(s.target);
      if (visible(el)) { begin(); return; }
      if (Date.now() - started < 1500) { poll = setTimeout(look, 120); return; }
      // Never appeared (e.g. a section this event doesn't have): skip it.
      if (dir.current < 0 && idx > 0) setIdx(idx - 1);
      else { dir.current = 1; setIdx(idx + 1); }
    };
    look();
    return () => {
      cancelled = true;
      clearTimeout(poll); clearTimeout(settle); clearInterval(follow); cancelAnimationFrame(raf);
      window.removeEventListener("scroll", tick, true); window.removeEventListener("resize", tick);
    };
  }, [idx, finish]);

  // One tap = one step (guards against a double tap skipping a card).
  const go = useCallback((d) => {
    const now = Date.now();
    if (now - lastMove.current < 350) return;
    lastMove.current = now;
    dir.current = d;
    setIdx((i) => (d < 0 ? Math.max(0, i - 1) : i + 1));
  }, []);

  useEffect(() => {
    if (idx < 0) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const f = setTimeout(() => nextBtn.current && nextBtn.current.focus({ preventScroll: true }), 60);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(f); };
  }, [idx, ready, finish, go]);

  if (!step || !ready) return null;

  const last = idx === steps.length - 1;
  const mobile = vw < 640;
  const cardW = Math.min(360, vw - 24);

  // Card position: below the target if there's room, else above; centered if no target.
  let cardStyle;
  if (!rect) {
    cardStyle = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
  } else if (mobile) {
    const targetMid = rect.top + rect.height / 2;
    cardStyle = targetMid > vh * 0.55
      ? { left: 12, right: 12, top: 12 }
      : { left: 12, right: 12, bottom: 12 };
  } else {
    const below = rect.top + rect.height + PAD + 14;
    const spaceBelow = vh - below;
    const left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
    cardStyle = spaceBelow > 230 ? { left, top: below } : { left, bottom: vh - rect.top + PAD + 14 };
  }

  const spot = rect ? {
    position: "fixed", top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
    borderRadius: 16, boxShadow: `0 0 0 9999px rgba(6,3,12,.72), 0 0 0 2px ${K.a}, 0 0 28px 4px color-mix(in srgb, ${K.a} 45%, transparent)`,
    transition: "top .25s ease, left .25s ease, width .25s ease, height .25s ease", pointerEvents: "none",
  } : null;

  const count = steps.length;
  const btn = { minHeight: 42, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: "pointer" };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={step.title} style={{ position: "fixed", inset: 0, zIndex: 9000 }}>
      {/* click-catcher: keeps the page from being used mid-tour */}
      <div onClick={() => {}} style={{ position: "fixed", inset: 0, background: rect ? "transparent" : "rgba(6,3,12,.72)" }} />
      {spot && <div style={spot} aria-hidden="true" />}
      <div style={{
        position: "fixed", ...cardStyle, width: mobile && rect ? "auto" : cardW, maxWidth: "calc(100vw - 24px)", boxSizing: "border-box",
        background: K.card, color: K.text, border: K.border, borderRadius: 18,
        padding: "16px 18px 14px", boxShadow: `0 18px 50px rgba(0,0,0,.55), 0 0 30px color-mix(in srgb, ${K.a} 14%, transparent)`,
        fontFamily: "Inter, system-ui, -apple-system, Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: K.a }}>
            {t("tour.stepOf").replace("{n}", idx + 1).replace("{t}", count)}
          </span>
          <button type="button" onClick={finish} style={{ background: "transparent", border: "none", color: K.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 0" }}>{t("tour.skip")}</button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25, margin: "6px 0 6px", letterSpacing: -0.2 }}>{step.title}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: K.body }}>{step.body}</div>
        <div style={{ display: "flex", gap: 5, margin: "14px 0 12px" }} aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} style={{ height: 5, flex: 1, maxWidth: 28, borderRadius: 99, background: i <= idx ? K.a : K.dotOff }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {idx > 0 && (
            <button type="button" onClick={() => go(-1)}
              style={{ ...btn, background: "transparent", color: K.text, border: K.backBorder }}>{t("tour.back")}</button>
          )}
          <button type="button" ref={nextBtn} onClick={() => { if (last) finish(); else go(1); }}
            style={{ ...btn, background: K.a, color: K.onA, border: "none" }}>
            {last ? (step.doneLabel || t("tour.done")) : t("tour.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Small "Take the tour" button.
export function TourButton({ id, label, style }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => replayTour(id)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", ...style }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
        <circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
      </svg>
      {label || t("tour.take")}
    </button>
  );
}
