// HALO guided tour: a full walkthrough that spotlights one part of the page at
// a time with a hint card (chapter, "12 of 40", progress bar, Back / Next,
// Turn off tips). Runs once per tour per browser on its own, can be replayed
// from the Help menu, and can start at any chapter.
//
// <Tour id="event" auto steps={[{ target, title, body, chapter, before, missing, skip }]} />
//   target   CSS selector. Omit it for a centered card.
//   chapter  short section name shown above the title.
//   before   function run when the step opens (open Settings, expand a panel).
//   missing  extra line shown when the target isn't on screen right now (the
//            card still shows, centered, so no step is ever silently dropped).
//   skip     true = skip this step when its target isn't on the page
//            (owner-only things a co-host never sees).
//   auto     start by itself the first time (unless tips are turned off).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { useSiteTheme } from "../lib/siteTheme.js";

const KEY = (id) => `halo_tour_${id}_done`;
const TIPS_KEY = "halo_tips_off";
const EVT = "halo:tour";
const TIPS_EVT = "halo:tips";
const PAD = 8;
const WAIT_MS = 1800;

export function tourDone(id) { try { return localStorage.getItem(KEY(id)) === "1"; } catch { return false; } }
function markDone(id) { try { localStorage.setItem(KEY(id), "1"); } catch {} }
export function replayTour(id, at = 0) { window.dispatchEvent(new CustomEvent(EVT, { detail: { id, at } })); }

export function tipsOn() { try { return localStorage.getItem(TIPS_KEY) !== "1"; } catch { return true; } }
export function setTipsOn(on) {
  try { if (on) localStorage.removeItem(TIPS_KEY); else localStorage.setItem(TIPS_KEY, "1"); } catch {}
  window.dispatchEvent(new CustomEvent(TIPS_EVT, { detail: { on } }));
}
// Forget which tours were seen, so each one plays again on its page.
export function resetTours() {
  try { Object.keys(localStorage).filter((k) => /^halo_tour_.+_done$/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch {}
  setTipsOn(true);
}
export function useTipsOn() {
  const [on, setOn] = useState(tipsOn);
  useEffect(() => {
    const h = () => setOn(tipsOn());
    window.addEventListener(TIPS_EVT, h);
    window.addEventListener("storage", h);
    return () => { window.removeEventListener(TIPS_EVT, h); window.removeEventListener("storage", h); };
  }, []);
  return on;
}

// Chapter list for the Help menu: [{ label, at }] in step order.
export function tourChapters(steps) {
  const out = [];
  steps.forEach((s, i) => { if (s.chapter && !out.some((c) => c.label === s.chapter)) out.push({ label: s.chapter, at: i }); });
  return out;
}

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// "Glow" look: hints use the site theme's SECOND color (cyan on the pink
// Obsidian theme, champagne on Midnight, and so on), so they never look like
// the theme's main-color buttons and always match whatever theme is chosen.
export function tourColors(th) {
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
    track: "rgba(255,255,255,.12)",
  };
}

export default function Tour({ id, steps, auto = false, delay = 700, onFinish }) {
  const { t } = useI18n();
  const K = tourColors(useSiteTheme());
  const [idx, setIdx] = useState(-1); // -1 = not running
  const [rect, setRect] = useState(null);
  const [absent, setAbsent] = useState(false); // current step's target isn't on screen
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 800);
  const nextBtn = useRef(null);
  const dir = useRef(1);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const start = useCallback((at = 0) => { dir.current = 1; setIdx(Math.max(0, at | 0)); }, []);
  const finish = useCallback(() => { setIdx(-1); setRect(null); markDone(id); onFinishRef.current && onFinishRef.current(); }, [id]);

  useEffect(() => {
    if (!auto || tourDone(id) || !tipsOn()) return;
    const tm = setTimeout(() => start(0), delay);
    return () => clearTimeout(tm);
  }, [auto, id, delay, start]);

  useEffect(() => {
    const on = (e) => { if (e.detail && e.detail.id === id) start(e.detail.at || 0); };
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, [id, start]);

  const step = idx >= 0 ? steps[idx] : null;

  // Steps are read through a ref: the parent re-renders all the time (live
  // photo updates, timers), and that must never re-run the step logic below.
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const [ready, setReady] = useState(false); // current step measured (or known absent)
  const lastMove = useRef(0);

  // Runs once per step change: open what the step needs, wait for its target
  // (sections can still be loading), then scroll to it and keep the spotlight
  // glued to it while the page moves. A missing target shows the card centered.
  useLayoutEffect(() => {
    if (idx < 0) return;
    const list = stepsRef.current;
    if (idx >= list.length) { finish(); return; }
    const s = list[idx];
    setReady(false);
    setAbsent(false);
    try { s.before && s.before(); } catch {}
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
      // Tall sections: line their top up near the top of the screen instead of
      // centering, so the heading being explained is in view.
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
      const block = tall ? "start" : "center";
      el.scrollIntoView({ block, behavior: "smooth" });
      measure(); setReady(true);
      // After the smooth scroll settles. If the page grew under it (a panel
      // that just opened), the scroll can stop short: jump the rest of the way.
      settle = setTimeout(() => {
        if (el && el.isConnected) {
          const r = el.getBoundingClientRect();
          if (r.top > window.innerHeight - 40 || r.bottom < 40) el.scrollIntoView({ block, behavior: "auto" });
        }
        measure();
      }, 600);
      follow = setInterval(measure, 400);          // follow layout shifts (images, live updates)
      window.addEventListener("scroll", tick, true);
      window.addEventListener("resize", tick);
    };
    const started = Date.now();
    const look = () => {
      if (cancelled) return;
      el = document.querySelector(s.target);
      if (visible(el)) { begin(); return; }
      if (Date.now() - started < WAIT_MS) { poll = setTimeout(look, 120); return; }
      if (s.skip) {
        if (dir.current < 0 && idx > 0) setIdx(idx - 1);
        else { dir.current = 1; setIdx(idx + 1); }
        return;
      }
      // Not on screen for this event right now: still explain it, centered.
      setRect(null); setAbsent(true); setReady(true);
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
  const cardW = Math.min(380, vw - 24);

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
    const spaceAbove = rect.top - PAD - 14;
    const left = Math.min(Math.max(12, rect.left), vw - cardW - 12);
    if (spaceBelow > 250) cardStyle = { left, top: below };
    else if (spaceAbove > 250) cardStyle = { left, bottom: vh - rect.top + PAD + 14 };
    else cardStyle = { right: 16, bottom: 16 }; // big section: tuck the card in a corner
  }

  const spot = rect ? {
    position: "fixed", top: Math.max(4, rect.top - PAD), left: rect.left - PAD, width: rect.width + PAD * 2,
    height: Math.min(rect.height + PAD * 2, vh - Math.max(4, rect.top - PAD) - 4),
    borderRadius: 16, boxShadow: `0 0 0 9999px rgba(6,3,12,.72), 0 0 0 2px ${K.a}, 0 0 28px 4px color-mix(in srgb, ${K.a} 45%, transparent)`,
    transition: "top .25s ease, left .25s ease, width .25s ease, height .25s ease", pointerEvents: "none",
  } : null;

  const count = steps.length;
  const pct = ((idx + 1) / count) * 100;
  const btn = { minHeight: 42, padding: "0 16px", borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: "pointer" };
  const turnOff = () => { setTipsOn(false); finish(); };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={step.title} style={{ position: "fixed", inset: 0, zIndex: 9000 }}>
      {/* click-catcher: keeps the page from being used mid-tour */}
      <div onClick={() => {}} style={{ position: "fixed", inset: 0, background: rect ? "transparent" : "rgba(6,3,12,.72)" }} />
      {spot && <div style={spot} aria-hidden="true" />}
      <div data-testid="tour-card" style={{
        position: "fixed", ...cardStyle, width: mobile && rect ? "auto" : cardW, maxWidth: "calc(100vw - 24px)", boxSizing: "border-box",
        maxHeight: "calc(100vh - 24px)", overflowY: "auto",
        background: K.card, color: K.text, border: K.border, borderRadius: 18,
        padding: "14px 18px 14px", boxShadow: `0 18px 50px rgba(0,0,0,.55), 0 0 30px color-mix(in srgb, ${K.a} 14%, transparent)`,
        fontFamily: "Inter, system-ui, -apple-system, Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: K.a, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {step.chapter ? `${step.chapter} · ` : ""}{t("tour.stepOf").replace("{n}", idx + 1).replace("{t}", count)}
          </span>
          <button type="button" onClick={finish}
            style={{ flexShrink: 0, background: "transparent", border: "none", color: K.muted, fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "6px 0" }}>{t("tour.skip")}</button>
        </div>
        <div style={{ height: 4, background: K.track, borderRadius: 99, margin: "8px 0 10px", overflow: "hidden" }} aria-hidden="true">
          <div style={{ width: `${pct}%`, height: "100%", background: K.a, borderRadius: 99, transition: "width .25s ease" }} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, margin: "0 0 6px", letterSpacing: -0.2 }}>{step.title}</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: K.body }}>{step.body}</div>
        {absent && step.missing && (
          <div style={{ fontSize: 13, lineHeight: 1.45, color: K.a, marginTop: 8, fontWeight: 600 }}>{step.missing}</div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14 }}>
          <button type="button" onClick={turnOff}
            style={{ background: "transparent", border: "none", color: K.muted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "6px 0", marginRight: "auto", textDecoration: "underline", textUnderlineOffset: 3 }}>
            {t("tour.turnOff")}
          </button>
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

const HelpIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
    <circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
  </svg>
);

// Small "Take the tour" button (used on the create-event form).
export function TourButton({ id, label, style }) {
  const { t } = useI18n();
  return (
    <button type="button" onClick={() => replayTour(id)}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", ...style }}>
      <HelpIcon />
      {label || t("tour.take")}
    </button>
  );
}

// Help menu: replay the full tour, jump to one chapter, switch tips on or off,
// or reset every tour so each page walks you through again.
export function HelpMenu({ id, chapters = [], style }) {
  const { t } = useI18n();
  const K = tourColors(useSiteTheme());
  const on = useTipsOn();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({});
  const wrap = useRef(null);
  const toggle = () => {
    if (!open && wrap.current) {
      // Keep the menu on screen: full width under the button on phones,
      // otherwise opening toward whichever side has room.
      const r = wrap.current.getBoundingClientRect();
      const W = window.innerWidth;
      if (W < 640) setPlace({ position: "fixed", top: r.bottom + 8, left: 12, right: 12, width: "auto" });
      else setPlace(r.left + 280 > W - 12 ? { right: 0 } : { left: 0 });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const run = (at) => { setOpen(false); setTimeout(() => replayTour(id, at), 60); };
  const item = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: "transparent", border: "none", color: K.text, fontSize: 14, fontWeight: 600, padding: "10px 12px", borderRadius: 10, cursor: "pointer", minHeight: 42, boxSizing: "border-box" };

  return (
    <span ref={wrap} style={{ position: "relative", display: "inline-flex", ...style }}>
      <button type="button" onClick={toggle} aria-expanded={open} aria-haspopup="menu" data-hint={t("help.hint")}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <HelpIcon />
        {t("help.button")}
      </button>
      {open && (
        <div role="menu" data-testid="help-menu" style={{
          position: "absolute", top: "calc(100% + 8px)", zIndex: 8000, width: 280, maxWidth: "calc(100vw - 24px)", ...place,
          maxHeight: "min(70vh, 520px)", overflowY: "auto", boxSizing: "border-box",
          background: K.card, border: K.border, borderRadius: 16, padding: 8,
          boxShadow: `0 18px 50px rgba(0,0,0,.55), 0 0 24px color-mix(in srgb, ${K.a} 12%, transparent)`,
          fontFamily: "Inter, system-ui, -apple-system, Arial, sans-serif",
        }}>
          <button type="button" role="menuitem" onClick={() => run(0)} style={{ ...item, background: K.a, color: K.onA, fontWeight: 800 }}>
            {t("help.full")}
          </button>
          {chapters.length > 1 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", color: K.a, padding: "12px 12px 4px" }}>{t("help.jump")}</div>
              {chapters.map((c) => (
                <button key={c.label} type="button" role="menuitem" onClick={() => run(c.at)} style={item}>{c.label}</button>
              ))}
            </>
          )}
          <div style={{ height: 1, background: K.track, margin: "8px 4px" }} />
          <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => setTipsOn(!on)} style={{ ...item, justifyContent: "space-between" }}>
            <span>{t("help.tips")}</span>
            <span aria-hidden="true" style={{ width: 40, height: 24, borderRadius: 99, background: on ? K.a : "transparent", border: `1px solid ${on ? K.a : "rgba(255,255,255,.3)"}`, position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: on ? K.onA : "rgba(255,255,255,.6)", transition: "left .2s ease" }} />
            </span>
          </button>
          <div style={{ fontSize: 12, color: K.muted, padding: "0 12px 6px", lineHeight: 1.4 }}>{t("help.tipsHelp")}</div>
          <button type="button" role="menuitem" onClick={() => { resetTours(); setOpen(false); }} style={{ ...item, color: K.muted, fontWeight: 600, fontSize: 13 }}>
            {t("help.reset")}
          </button>
        </div>
      )}
    </span>
  );
}

// Button help on a computer: resting the mouse on anything with data-hint
// shows a small label explaining what it does. Phones have no hover, so the
// tour does that job there. Follows the tips on/off switch.
export function HoverHints() {
  const K = tourColors(useSiteTheme());
  const on = useTipsOn();
  const [hint, setHint] = useState(null); // { text, x, y, below }
  useEffect(() => {
    if (!on || typeof window === "undefined" || !window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let timer = 0, cur = null;
    const hide = () => { clearTimeout(timer); cur = null; setHint(null); };
    const over = (e) => {
      const el = e.target && e.target.closest ? e.target.closest("[data-hint]") : null;
      if (el === cur) return;
      clearTimeout(timer); setHint(null); cur = el;
      if (!el) return;
      timer = setTimeout(() => {
        const text = el.getAttribute("data-hint");
        if (!text || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 70;
        setHint({ text, x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: below ? r.bottom + 8 : r.top - 8, below });
      }, 380);
    };
    document.addEventListener("mouseover", over);
    document.addEventListener("pointerdown", hide, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("pointerdown", hide, true);
      window.removeEventListener("scroll", hide, true);
    };
  }, [on]);
  if (!hint) return null;
  return createPortal(
    <div role="tooltip" data-testid="hover-hint" style={{
      position: "fixed", left: hint.x, top: hint.y, transform: `translate(-50%, ${hint.below ? "0" : "-100%"})`, zIndex: 8500,
      maxWidth: 240, padding: "7px 11px", borderRadius: 10, background: K.card, border: K.border, color: "#fff",
      fontSize: 12.5, lineHeight: 1.4, fontWeight: 600, pointerEvents: "none", boxShadow: "0 8px 24px rgba(0,0,0,.45)",
      fontFamily: "Inter, system-ui, -apple-system, Arial, sans-serif", textAlign: "center",
    }}>{hint.text}</div>,
    document.body
  );
}
