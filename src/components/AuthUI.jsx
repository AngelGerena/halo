import React, { useEffect, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { LangToggle } from "./UI.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { HeartBuddy, ThumbBuddy, LIVE_REACTION_CSS } from "./LiveReactions.jsx";

// Shared chrome for the auth pages (sign up / login / reset): the "Live Wall".
// Guest photos drift slowly behind the screen like the TV wall at an event,
// reaction buddies float up the side, and the form sits on frosted glass in
// front. Colours follow the site theme picked in Admin > Site Appearance, so
// the auth pages always match the homepage.

// Accent colours per site theme (keep in sync with public/landing/css/halo.css).
const THEMES = {
  midnight: { a: "#ffb86b", a2: "#ffd9a8", on: "#1a0b04" },
  blush:    { a: "#c98a6a", a2: "#e8b4c4", on: "#fffaf4" },
  obsidian: { a: "#ff2d9b", a2: "#36e3ff", on: "#05010a" },
  emerald:  { a: "#d9b86a", a2: "#f0dca6", on: "#0a1c13" },
  sunset:   { a: "#ff9e6b", a2: "#ffd0a0", on: "#2a160d" },
  plum:     { a: "#c9a0ff", a2: "#e4cfff", on: "#1b0f2a" },
  ivory:    { a: "#d4ad45", a2: "#f0dca6", on: "#17150f" },
  sapphire: { a: "#e7c56b", a2: "#9fc4ff", on: "#0a142b" },
  rosegold: { a: "#d98d98", a2: "#e6bf8a", on: "#2e2426" },
  onyx:     { a: "#f0a830", a2: "#ffd98a", on: "#241803" },
};

function readCachedTheme() {
  try { const t = localStorage.getItem("halo_theme"); return THEMES[t] ? t : null; } catch { return null; }
}

function useSiteTheme() {
  const [theme, setTheme] = useState(() => readCachedTheme() || "midnight");
  useEffect(() => {
    let alive = true;
    fetch("/.netlify/functions/site-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !THEMES[d.theme]) return;
        setTheme(d.theme);
        try { localStorage.setItem("halo_theme", d.theme); } catch {}
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return THEMES[theme];
}

const IMG = "/landing/images/";
const WALL = [
  ["friends.webp", "moments/couple-portrait.webp", "moments/birthday-dinner.webp", "qr-scan.webp"],
  ["wedding.webp", "moments/group-selfie.webp", "moments/church-doors.webp", "quinceanera.webp"],
  ["moments/grand-exit.webp", "quinceanera.webp", "friends.webp", "wedding.webp"],
];

// Reaction buddies drifting up the right side, the same ones guests see on the TV.
function Buddies() {
  const [items, setItems] = useState([]);
  const n = useRef(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const spawn = () => {
      const id = ++n.current;
      const item = {
        id,
        kind: id % 3 === 0 ? "like" : "heart",
        right: 4 + Math.random() * 18,
        size: 34 + Math.random() * 18,
        drift: Math.round(-30 + Math.random() * 40) + "px",
        dur: (4.2 + Math.random() * 1.6).toFixed(2) + "s",
      };
      setItems((xs) => [...xs.slice(-5), item]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6500);
    };
    spawn();
    const t = setInterval(spawn, 2300);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="lw-buddies" aria-hidden="true">
      {items.map((x) => (
        <div key={x.id} className="rx-float"
          style={{ right: x.right + "%", width: x.size, height: x.size, "--drift": x.drift, "--dur": x.dur }}>
          {x.kind === "like" ? <ThumbBuddy /> : <HeartBuddy />}
        </div>
      ))}
    </div>
  );
}

const LW_CSS = `
.lw{position:relative;min-height:100vh;min-height:100dvh;background:#000;color:#fff;overflow:hidden;isolation:isolate}
.lw-wall{position:fixed;inset:-20px;z-index:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0 8px;overflow:hidden;pointer-events:none}
@media(min-width:900px){.lw-wall{grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}}
.lw-col{display:flex;flex-direction:column;gap:8px;animation:lwDrift 40s linear infinite;will-change:transform}
.lw-col:nth-child(2n){animation-duration:48s;animation-direction:reverse;margin-top:-60px}
.lw-col:nth-child(3n){animation-duration:44s;margin-top:-120px}
.lw-col div{flex:none;border-radius:14px;aspect-ratio:3/4;background:#111 center/cover no-repeat}
.lw-shade{position:fixed;inset:0;z-index:1;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.38) 24%,rgba(0,0,0,.6) 46%,rgba(0,0,0,.94) 72%,#000 100%)}
@media(min-width:900px){.lw-shade{background:linear-gradient(90deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,.92) 32%,rgba(0,0,0,.95) 50%,rgba(0,0,0,.92) 68%,rgba(0,0,0,.6) 100%)}}
.lw-buddies{position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden}
.lw-inner{position:relative;z-index:3;min-height:100vh;min-height:100dvh;max-width:440px;margin:0 auto;display:flex;flex-direction:column;
  padding:calc(12px + env(safe-area-inset-top,0px)) max(18px,env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(18px,env(safe-area-inset-left,0px))}
.lw-top{display:flex;justify-content:space-between;align-items:center;gap:12px}
.lw-wm{font-family:var(--display);font-size:28px;letter-spacing:.06em;line-height:1;color:#fff;text-decoration:none}
.lw-head{padding:26px 4px 22px}
.lw-live{display:inline-flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.2);border-radius:999px;padding:6px 12px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.lw-live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold);animation:lwPing 1.6s ease-out infinite}
.lw-title{font-family:var(--display);font-weight:400;font-size:clamp(46px,14vw,62px);line-height:.92;letter-spacing:.02em;margin:14px 0 0;text-wrap:balance;text-shadow:0 8px 40px rgba(0,0,0,.6)}
.lw-sub{margin:10px 0 0;color:#e7e3ee;font-size:15px;line-height:1.5;max-width:30ch;text-shadow:0 2px 12px rgba(0,0,0,.7)}
.lw-glass{margin-top:auto;border-radius:26px;padding:22px 20px 20px;background:rgba(16,16,22,.72);border:1px solid rgba(255,255,255,.14);
  backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3);box-shadow:0 30px 60px rgba(0,0,0,.45)}
@media(min-width:900px){.lw-inner{justify-content:center}.lw-glass{margin-top:0}.lw-head{padding-top:40px}}
.lw-glass .field{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.16);border-radius:14px;padding:14px 16px}
.lw-glass .field:focus{outline:none;border-color:var(--gold);background:rgba(255,255,255,.1)}
.lw-glass .field::placeholder{color:#8a8396}
.lw-glass .btn-gold{min-height:54px;font-size:16px;box-shadow:0 10px 30px color-mix(in srgb,var(--gold) 35%,transparent)}
.lw-foot{margin:16px 0 0;text-align:center;font-size:11.5px;letter-spacing:.03em;color:rgba(255,255,255,.55)}
.lw-foot a{color:inherit;text-decoration:underline;text-underline-offset:2px}
@keyframes lwDrift{to{transform:translateY(-50%)}}
@keyframes lwPing{0%{box-shadow:0 0 0 0 var(--gold)}70%,100%{box-shadow:0 0 0 8px transparent}}
@media(prefers-reduced-motion:reduce){.lw-col,.lw-live::before{animation:none!important}}
`;

export function AuthShell({ title, sub, children }) {
  const th = useSiteTheme();
  const { t } = useI18n();
  const cols = typeof window !== "undefined" && window.innerWidth >= 900 ? [...WALL, WALL[1].slice().reverse(), WALL[0].slice().reverse()] : WALL;
  return (
    <div className="lw" style={{ "--gold": th.a, "--gold-light": th.a2, "--ink": th.on }}>
      <style>{LW_CSS + LIVE_REACTION_CSS}</style>
      <div className="lw-wall" aria-hidden="true">
        {cols.map((col, i) => (
          <div className="lw-col" key={i}>
            {[...col, ...col].map((src, j) => (
              <div key={j} style={{ backgroundImage: `url(${IMG + src})` }} />
            ))}
          </div>
        ))}
      </div>
      <div className="lw-shade" aria-hidden="true" />
      <Buddies />
      <div className="lw-inner">
        <div className="lw-top">
          <a href="/" className="lw-wm" aria-label="HALO home">HALO</a>
          <LangToggle />
        </div>
        <div className="lw-head">
          <span className="lw-live">{t("auth.live")}</span>
          <h1 className="lw-title">{title}</h1>
          {sub && <p className="lw-sub">{sub}</p>}
        </div>
        <div className="lw-glass">{children}</div>
        <p className="lw-foot">
          HALO {t("auth.by")} <a href="https://finessemedia.pro" target="_blank" rel="noopener noreferrer">Finesse Media</a>
        </p>
      </div>
    </div>
  );
}

export function AuthField({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 7 }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: C.second, marginTop: 6 }}>{hint}</span>}
    </label>
  );
}

// Error text for the auth pages. Pages store either one of our own keys
// ("auth.err.*") or the raw message from Supabase; both come out in the
// active language, and switching EN/ES re-translates an error already showing.
export function authErrorText(err, t) {
  if (!err) return "";
  if (err.startsWith("auth.err.")) return t(err);
  const m = err.toLowerCase();
  if (m.includes("invalid login")) return t("auth.err.invalid");
  if (m.includes("not confirmed")) return t("auth.err.unconfirmed");
  if (m.includes("already registered") || m.includes("already exists")) return t("auth.err.exists");
  if (m.includes("rate limit") || m.includes("too many") || m.includes("security purposes")) return t("auth.err.rate");
  if (m.includes("invalid") && m.includes("email")) return t("auth.err.badEmail");
  if (m.includes("different from the old")) return t("auth.err.samePw");
  if (m.includes("at least 6")) return t("auth.err.short");
  return err;
}

export function AuthButton({ busy, busyLabel, children, ...rest }) {
  const { t } = useI18n();
  return (
    <button
      type="submit"
      disabled={busy}
      className="btn-gold btn-full"
      style={{ marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
      {...rest}
    >
      {busy ? busyLabel || t("auth.wait") : children}
    </button>
  );
}

export function AuthError({ children }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(255,61,129,.12)",
        border: "1px solid rgba(255,61,129,.4)",
        color: "#ff9bbf",
        fontSize: 13,
        lineHeight: 1.5,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export function AuthNote({ children }) {
  return (
    <div
      style={{
        background: "rgba(0,194,203,.1)",
        border: "1px solid rgba(0,194,203,.35)",
        color: "#8fe6ea",
        fontSize: 13,
        lineHeight: 1.5,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}
