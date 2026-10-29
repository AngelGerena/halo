import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useI18n } from "../lib/i18n.jsx";

// "Show on TV" for the live wall. Three ways to get the wall onto a big
// screen, and the sheet leads with the one that fits this device:
//   1. Cast (Chrome / Android, Chromecast or Google TV) via the Presentation
//      API. Only shown when the browser offers it.
//   2. AirPlay Screen Mirroring (iPhone / iPad / Mac), as two-tap steps.
//      Apple doesn't let a web page send itself to AirPlay, only mirror.
//   3. Open the wall in the TV's own browser: short link + QR code. Works on
//      any smart TV, Fire TV, projector or laptop with a browser.

const isApple = () => /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && !/Chrome|CriOS|Android/.test(navigator.userAgent);

const TvIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" />
  </svg>
);
const CastIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" /><path d="M3 12a8 8 0 0 1 8 8M3 16a4 4 0 0 1 4 4" /><circle cx="3.5" cy="19.5" r="1" fill="currentColor" />
  </svg>
);
const MirrorIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8l-4-5z" fill="currentColor" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </svg>
);

export function ShowOnTVButton({ onClick, label }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} style={pillBtn}>
      <TvIcon />{label}
    </button>
  );
}

export const pillBtn = {
  display: "flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0 max(1.2vw, 16px) 0 max(1vw, 12px)", borderRadius: 999,
  background: "rgba(0,0,0,.55)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", fontSize: "max(.95vw, 14px)", fontWeight: 700,
  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", cursor: "pointer", whiteSpace: "nowrap",
};

export default function ShowOnTVSheet({ code, onClose }) {
  const { t } = useI18n();
  const url = `${window.location.origin}/live/${code}`;
  const shortUrl = url.replace(/^https?:\/\//, "");
  const [qr, setQr] = useState("");
  const [castState, setCastState] = useState("idle"); // idle | connecting | connected | failed
  const [copied, setCopied] = useState(false);
  const connRef = useRef(null);
  const canCast = typeof window !== "undefined" && "PresentationRequest" in window;
  const apple = isApple();

  useEffect(() => {
    QRCode.toDataURL(url, { width: 520, margin: 1, color: { dark: "#0a0410", light: "#ffffff" } }).then(setQr).catch(() => {});
  }, [url]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function cast() {
    setCastState("connecting");
    try {
      const req = new window.PresentationRequest([url + "?tv=1"]);
      const conn = await req.start();
      connRef.current = conn;
      setCastState("connected");
      conn.onterminate = conn.onclose = () => setCastState("idle");
    } catch (e) {
      // The user closing the picker isn't a failure.
      setCastState(e && e.name === "NotAllowedError" ? "idle" : "failed");
    }
  }
  function stopCast() { try { connRef.current?.terminate(); } catch {} setCastState("idle"); }

  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  const castCard = canCast && (
    <section style={card} key="cast">
      <div style={cardHead}><span style={iconDot}><CastIcon /></span><div><b style={h}>{t("tvs.cast.t")}</b><p style={p}>{t("tvs.cast.d")}</p></div></div>
      {castState === "connected" ? (
        <button onClick={stopCast} style={ghostBtn}>{t("tvs.cast.stop")}</button>
      ) : (
        <button onClick={cast} disabled={castState === "connecting"} style={{ ...goldBtn, opacity: castState === "connecting" ? 0.6 : 1 }}>
          {castState === "connecting" ? t("tvs.cast.connecting") : t("tvs.cast.btn")}
        </button>
      )}
      {castState === "connected" && <p style={{ ...p, color: "#3ee08f", marginTop: 8 }}>{t("tvs.cast.on")}</p>}
      {castState === "failed" && <p style={{ ...p, color: "#ff9bbf", marginTop: 8 }}>{t("tvs.cast.fail")}</p>}
    </section>
  );
  const mirrorCard = (
    <section style={card} key="mirror">
      <div style={cardHead}><span style={iconDot}><MirrorIcon /></span><div><b style={h}>{t("tvs.air.t")}</b><p style={p}>{t("tvs.air.d")}</p></div></div>
      <ol style={steps}>
        <li>{t("tvs.air.s1")}</li>
        <li>{t("tvs.air.s2")}</li>
        <li>{t("tvs.air.s3")}</li>
      </ol>
    </section>
  );
  const linkCard = (
    <section style={card} key="link">
      <div style={cardHead}><span style={iconDot}><LinkIcon /></span><div><b style={h}>{t("tvs.link.t")}</b><p style={p}>{t("tvs.link.d")}</p></div></div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        {qr && <img src={qr} alt="" width="120" height="120" style={{ borderRadius: 12, background: "#fff", flex: "none" }} />}
        <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
          <code style={urlBox}>{shortUrl}</code>
          <button onClick={copy} style={ghostBtn}>{copied ? t("tvs.link.copied") : t("tvs.link.copy")}</button>
        </div>
      </div>
      <p style={{ ...p, marginTop: 10 }}>{t("tvs.link.tip")}</p>
    </section>
  );
  // Lead with what works on this device.
  const order = apple ? [mirrorCard, linkCard, castCard] : canCast ? [castCard, linkCard, mirrorCard] : [linkCard, mirrorCard];

  return (
    <div role="dialog" aria-modal="true" aria-label={t("tvs.title")}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 520, maxHeight: "92%", overflowY: "auto", background: "#101016", color: "#fff", borderRadius: "26px 26px 0 0",
          border: "1px solid rgba(255,255,255,.12)", padding: "22px max(18px, env(safe-area-inset-right, 0px)) calc(20px + env(safe-area-inset-bottom, 0px)) max(18px, env(safe-area-inset-left, 0px))",
          fontFamily: "'Space Grotesk', system-ui, sans-serif", fontSize: 15, boxShadow: "0 -20px 60px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <h2 style={{ fontFamily: "Anton, Impact, sans-serif", fontWeight: 400, fontSize: 34, letterSpacing: ".02em", margin: 0, lineHeight: 1 }}>{t("tvs.title")}</h2>
          <button onClick={onClose} aria-label={t("tvs.close")} style={{ ...ghostBtn, width: 44, padding: 0, flex: "none" }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{order.filter(Boolean)}</div>
      </div>
    </div>
  );
}

const card = { background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 18, padding: 16 };
const cardHead = { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 12 };
const iconDot = { width: 40, height: 40, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--gold, #ffb86b) 18%, transparent)", color: "var(--gold, #ffb86b)" };
const h = { display: "block", fontSize: 16, marginBottom: 2 };
const p = { margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "#c6cad8" };
const steps = { margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 14, lineHeight: 1.45, color: "#e7e3ee" };
const goldBtn = { width: "100%", minHeight: 48, borderRadius: 999, border: 0, background: "var(--gold, #ffb86b)", color: "#0a0410", fontSize: 15, fontWeight: 700, cursor: "pointer" };
const ghostBtn = { minHeight: 44, borderRadius: 999, border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "0 16px", display: "grid", placeItems: "center" };
const urlBox = { display: "block", padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,.4)", border: "1px solid rgba(255,255,255,.12)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, color: "#fff", overflowWrap: "anywhere", userSelect: "all" };
