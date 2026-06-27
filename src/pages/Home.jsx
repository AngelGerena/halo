import React from "react";
import { Header, Footer, HaloMark } from "../components/UI.jsx";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

export default function Home() {
  const { t } = useI18n();
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1, textAlign: "center", maxWidth: 620 }}>
        <div style={{ margin: "30px auto 0", display: "inline-flex" }}><HaloMark size={64} /></div>
        <h1 className="serif" style={{ fontSize: 52, color: C.ink, margin: "18px 0 8px", lineHeight: 1.04 }}>
          {t("home.title")}
        </h1>
        <p style={{ fontSize: 17, color: C.second, maxWidth: 460, margin: "0 auto 28px" }}>
          {t("home.subtitle")}
        </p>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr", maxWidth: 460, margin: "0 auto 24px", textAlign: "left" }}>
          <Feature n={t("home.feat.scan.t")} d={t("home.feat.scan.d")} />
          <Feature n={t("home.feat.curate.t")} d={t("home.feat.curate.d")} />
          <Feature n={t("home.feat.gallery.t")} d={t("home.feat.gallery.d")} />
          <Feature n={t("home.feat.export.t")} d={t("home.feat.export.d")} />
        </div>

        <a href="/admin" style={{ textDecoration: "none" }}>
          <button style={{ background: C.gold, color: C.ink, padding: "13px 24px", borderRadius: 10, fontSize: 15 }}>
            {t("home.cta")}
          </button>
        </a>
      </main>
      <Footer />
    </div>
  );
}

function Feature({ n, d }) {
  return (
    <div style={{ background: C.white, borderRadius: 12, padding: "14px 16px", border: "1px solid rgba(28,38,64,.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.gold, textTransform: "uppercase", letterSpacing: 1.5 }}>{n}</div>
      <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{d}</div>
    </div>
  );
}
