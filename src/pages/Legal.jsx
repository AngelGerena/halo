import React from "react";
import { Header, Footer } from "../components/UI.jsx";
import { C } from "../lib/score.js";
import { LEGAL } from "../lib/legal.js";

export default function Legal() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1, maxWidth: 820 }}>
        <h1 className="serif" style={{ fontSize: 40, color: C.ink, margin: "12px 0 6px" }}>Legal</h1>
        <p style={{ color: C.second, fontSize: 13, marginBottom: 18 }}>
          These are HALO's current policies. Questions? <a href="mailto:finessemediapro@gmail.com" style={{ color: C.ink }}>finessemediapro@gmail.com</a>
        </p>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
          {LEGAL.map((s) => (
            <a key={s.id} href={`#${s.id}`} style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none", borderBottom: `2px solid ${C.gold}` }}>{s.title}</a>
          ))}
        </div>
        {LEGAL.map((s) => (
          <section key={s.id} id={s.id} style={{ marginBottom: 34, scrollMarginTop: 80 }}>
            <h2 className="serif" style={{ fontSize: 27, color: C.ink, margin: "0 0 12px", borderTop: `3px solid ${C.gold}`, paddingTop: 14 }}>{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} style={{ color: C.text, fontSize: 14.5, lineHeight: 1.65, margin: "0 0 12px" }}>{p}</p>
            ))}
          </section>
        ))}
      </main>
      <Footer />
    </div>
  );
}
