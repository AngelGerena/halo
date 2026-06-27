import React from "react";
import { C } from "../lib/score.js";

export function HaloMark({ size = 34 }) {
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `3px solid ${C.gold}`, opacity: 0.9 }} />
      <div style={{ position: "absolute", inset: size * 0.23, borderRadius: "50%", background: C.gold, opacity: 0.25 }} />
    </div>
  );
}

export function Header({ right }) {
  return (
    <header style={{ background: C.ink, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <a href="/" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
        <HaloMark />
        <div>
          <div className="serif" style={{ color: C.bg, fontSize: 26, fontWeight: 700, letterSpacing: 1, lineHeight: 1 }}>HALO</div>
          <div style={{ color: C.gold, fontSize: 10, letterSpacing: 3, textTransform: "uppercase" }}>Holy moments, auto-curated</div>
        </div>
      </a>
      <div>{right}</div>
    </header>
  );
}

export function Stat({ label, value, gold }) {
  return (
    <div style={{ flex: 1, background: C.white, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(28,38,64,.08)" }}>
      <div className="serif" style={{ fontSize: 30, fontWeight: 700, color: gold ? C.gold : C.ink, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.second, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function Empty({ title, sub, action, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", maxWidth: 440, margin: "0 auto" }}>
      <div style={{ width: 56, height: 56, margin: "0 auto 16px", borderRadius: "50%", border: `3px solid ${C.gold}`, opacity: 0.7 }} />
      <h2 className="serif" style={{ fontSize: 28, color: C.ink, margin: "0 0 6px" }}>{title}</h2>
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
  return (
    <footer style={{ textAlign: "center", padding: 20, color: C.second, fontSize: 12 }}>
      HALO by Finesse Media{code ? ` · ${code}` : ""} · "For I know the plans I have for you" — Jeremiah 29:11
    </footer>
  );
}
