import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

export function HaloMark({ size = 34 }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${C.gold}`, opacity: 0.9 }} />
      <div style={{ position: "absolute", inset: size * 0.23, borderRadius: "50%", background: C.gold, opacity: 0.25 }} />
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div style={{ display: "inline-flex", borderRadius: 999, border: "1px solid rgba(255,255,255,.3)", overflow: "hidden" }}>
      <button onClick={() => setLang("en")} aria-pressed={lang === "en"}
        style={{ background: lang === "en" ? C.gold : "transparent", color: lang === "en" ? C.ink : C.text, border: "none", padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 0 }}>EN</button>
      <button onClick={() => setLang("es")} aria-pressed={lang === "es"}
        style={{ background: lang === "es" ? C.gold : "transparent", color: lang === "es" ? C.ink : C.text, border: "none", padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 0 }}>ES</button>
    </div>
  );
}

export function Header({ right, onHero = false }) {
  const { t } = useI18n();
  return (
    <header className={"halo-header" + (onHero ? " on-hero" : "")}>
      {onHero && <div className="hh-bleed" />}
      <div className="hh-gold" />
      <div className="hh-bg" />
      <a href="/" className="hh-logo">
        <img src="/halo-logo.png" alt="HALO" />
      </a>
      {onHero && <div className="hh-tag">{t("brand.tagline")}</div>}
      <div className="hh-right">
        <span className="hh-cta">{right}</span>
        <LangToggle />
      </div>
    </header>
  );
}

export function Stat({ label, value, gold }) {
  return (
    <div style={{ flex: 1, background: C.card, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(255,255,255,.1)" }}>
      <div className="serif" style={{ fontSize: 30, fontWeight: 700, color: gold ? C.gold : C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.second, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function Empty({ title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", maxWidth: 440, margin: "0 auto" }}>
      <img src="/halo-icon-512.png" alt="HALO" width="64" height="64" style={{ display: "block", width: 64, height: 64, margin: "0 auto 16px", objectFit: "contain" }} />
      <h2 className="serif" style={{ fontSize: 28, color: C.text, margin: "0 0 6px" }}>{title}</h2>
      <p style={{ color: C.second, marginTop: 0 }}>{sub}</p>
      {action && (
        <button onClick={onAction} style={{ marginTop: 10, background: C.gold, color: C.ink, padding: "11px 20px", borderRadius: 10, fontSize: 14 }}>{action}</button>
      )}
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div style={{ textAlign: "center", padding: "70px 20px", color: C.second }}>
      <div className="spin" style={{ width: 38, height: 38, margin: "0 auto 14px", borderRadius: "50%", border: `3px solid rgba(107,140,174,.3)`, borderTopColor: C.gold }} />
      <div style={{ fontSize: 14 }}>{label || "Loading…"}</div>
    </div>
  );
}

export function Footer({ code }) {
  const { t } = useI18n();
  return (
    <footer style={{ textAlign: "center", padding: 20, color: C.second, fontSize: 12 }}>
      HALO by Finesse Media{code ? ` · ${code}` : ""} · {t("footer.scripture")} · <a href="/legal" style={{ color: C.second }}>{t("footer.legal")}</a>
    </footer>
  );
}
