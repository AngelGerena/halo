import React, { useState, useRef } from "react";
import { Header, Footer } from "../components/UI.jsx";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

const COPY = {
  en: {
    early: "Request early access", cs: "Coming soon",
    h1: "Every moment, gathered.",
    hp: "A bilingual, done-for-you photo experience for churches. Your congregation scans one code; HALO curates, edits, and delivers beautiful galleries — and a live slideshow on the big screen. Launching soon.",
    see: "See how it works",
    note: "Founding churches get early access + locked-in founding pricing.",
    bw: "The basics", bh: "Three steps to a full gallery", bl: "No sign-ups, no app downloads. Just a code and a camera.",
    s1t: "Scan the code", s1p: "Print or project the QR. Anyone points their phone — opens instantly, no app, no account.",
    s2t: "Capture & upload", s2p: "Everyone shares what they shoot. HALO keeps the sharp, well-lit moments and edits them automatically.",
    s3t: "Relive & share", s3p: "Private galleries for every person, a live slideshow on screen, and originals ready to post.",
    pw: "Founding pricing", ph: "Simple plans, coming soon",
    pl: "Start free, keep it for a low monthly, and add a premium pack for your big events. Early churches lock in founding rates.",
    popular: "Most popular",
    tiers: [
      { n: "First event", a: "Free", s: "Try HALO with zero risk", f: ["One full event", "Auto-curated galleries", "Live slideshow"] },
      { n: "Church plan", a: "$19", per: "/mo", s: "Everything, every Sunday", f: ["Unlimited events", "Your branding", "Bilingual + all features"], feat: true },
      { n: "Premium pack", a: "$49", per: "/event", s: "For Easter & graduations", f: ["Auto highlight-reel video", "Branded social graphics", "Done-for-you setup"] },
      { n: "Multi-campus", a: "$99", per: "/mo", s: "For larger churches", f: ["Multiple campuses", "White-label", "Priority support"] },
    ],
    pn: "Pricing is indicative and may change at launch. Founding churches keep their early rate.",
    fh: "Be a founding church", fs: "Tell us about your church and we'll reach out with early access and founding pricing as soon as we launch.",
    phC: "Church name", phN: "Your name", phE: "Email", phS: "Congregation size (approx.)", phEv: "What event are you thinking of? (e.g. Easter, weekly service)", phP: "What would you expect to pay? (optional)",
    fsub: "Request early access", fsending: "Sending…", fp: "No spam. We'll only use this to contact you about HALO.",
    okh: "Thank you!", okp: "We've got your request — we'll reach out with early access and founding pricing soon.",
    err: "Something went wrong. Please try again.",
  },
  es: {
    early: "Solicitar acceso anticipado", cs: "Próximamente",
    h1: "Cada momento, reunido.",
    hp: "Una experiencia de fotos bilingüe y lista para usar, para iglesias. Tu congregación escanea un código; HALO cura, edita y entrega galerías hermosas — y una presentación en vivo en la pantalla grande. Próximamente.",
    see: "Ver cómo funciona",
    note: "Las iglesias fundadoras obtienen acceso anticipado y precio fundador asegurado.",
    bw: "Lo básico", bh: "Tres pasos para una galería completa", bl: "Sin registros, sin descargas. Solo un código y una cámara.",
    s1t: "Escanea el código", s1p: "Imprime o proyecta el QR. Cualquiera apunta su teléfono — abre al instante, sin app, sin cuenta.",
    s2t: "Captura y sube", s2p: "Todos comparten lo que toman. HALO conserva los momentos nítidos y bien iluminados y los edita automáticamente.",
    s3t: "Revive y comparte", s3p: "Galerías privadas para cada persona, una presentación en vivo en pantalla, y originales listos para publicar.",
    pw: "Precio fundador", ph: "Planes simples, próximamente",
    pl: "Empieza gratis, mantenlo por una mensualidad baja, y agrega un paquete premium para tus grandes eventos. Las iglesias tempranas aseguran tarifas fundadoras.",
    popular: "Más popular",
    tiers: [
      { n: "Primer evento", a: "Gratis", s: "Prueba HALO sin riesgo", f: ["Un evento completo", "Galerías auto-curadas", "Presentación en vivo"] },
      { n: "Plan iglesia", a: "$19", per: "/mes", s: "Todo, cada domingo", f: ["Eventos ilimitados", "Tu marca", "Bilingüe + todo incluido"], feat: true },
      { n: "Paquete premium", a: "$49", per: "/evento", s: "Para Pascua y graduaciones", f: ["Video destacado automático", "Gráficas para redes con tu marca", "Configuración lista para usar"] },
      { n: "Multi-campus", a: "$99", per: "/mes", s: "Para iglesias grandes", f: ["Múltiples campus", "Marca blanca", "Soporte prioritario"] },
    ],
    pn: "El precio es indicativo y puede cambiar al lanzamiento. Las iglesias fundadoras mantienen su tarifa temprana.",
    fh: "Sé una iglesia fundadora", fs: "Cuéntanos sobre tu iglesia y te contactaremos con acceso anticipado y precio fundador en cuanto lancemos.",
    phC: "Nombre de la iglesia", phN: "Tu nombre", phE: "Correo electrónico", phS: "Tamaño de la congregación (aprox.)", phEv: "¿Qué evento tienes en mente? (ej. Pascua, servicio semanal)", phP: "¿Cuánto esperarías pagar? (opcional)",
    fsub: "Solicitar acceso anticipado", fsending: "Enviando…", fp: "Sin spam. Solo usaremos esto para contactarte sobre HALO.",
    okh: "¡Gracias!", okp: "Recibimos tu solicitud — te contactaremos con acceso anticipado y precio fundador muy pronto.",
    err: "Algo salió mal. Inténtalo de nuevo.",
  },
};

export default function Home() {
  const { lang } = useI18n();
  const t = COPY[lang] || COPY.en;
  const formRef = useRef(null);
  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const [f, setF] = useState({ church: "", name: "", email: "", size: "", eventType: "", budget: "" });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const upd = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit() {
    if (!f.email.trim() && !f.name.trim()) { setErr(t.err); return; }
    setSending(true); setErr("");
    try {
      const r = await fetch("/.netlify/functions/request-access", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      if (!r.ok) throw new Error("failed");
      setDone(true);
    } catch { setErr(t.err); } finally { setSending(false); }
  }

  const inp = { width: "100%", padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(244,238,223,.25)", background: "rgba(244,238,223,.06)", color: C.bg, fontSize: 14, fontFamily: "Manrope, sans-serif" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header right={<button onClick={scrollToForm} style={{ background: C.gold, color: C.ink, borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 600 }}>{t.early}</button>} />

      {/* HERO */}
      <div style={{ background: "linear-gradient(125deg, rgba(14,27,54,.77), rgba(27,52,100,.77) 55%, rgba(38,70,112,.77)), url('/halo-hero.jpg') center/cover no-repeat", color: C.bg, padding: "64px 24px 88px", textAlign: "center", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 340, height: 340, background: "radial-gradient(circle, rgba(230,200,121,.20), transparent 62%)", pointerEvents: "none" }} />
        <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.inkDeep, background: C.goldLight, padding: "6px 16px", borderRadius: 999 }}>{t.cs}</span>
        <h1 className="serif" style={{ fontSize: 54, lineHeight: 1.04, margin: "20px 0 12px", fontWeight: 700 }}>{t.h1}</h1>
        <p style={{ maxWidth: 560, margin: "0 auto", fontSize: 17, color: "#cdd6e3", lineHeight: 1.5 }}>{t.hp}</p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
          <button onClick={scrollToForm} style={{ background: C.gold, color: C.ink, border: 0, borderRadius: 12, padding: "14px 26px", fontSize: 15, fontWeight: 600 }}>{t.early}</button>
          <a href="#basics" style={{ textDecoration: "none" }}><button style={{ background: "transparent", color: C.bg, border: "1px solid rgba(244,238,223,.45)", borderRadius: 12, padding: "14px 26px", fontSize: 15, fontWeight: 600 }}>{t.see}</button></a>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: C.goldLight, letterSpacing: 1 }}>{t.note}</div>
      </div>

      <main style={{ flex: 1 }}>
        {/* BASICS */}
        <section id="basics" className="wrap" style={{ paddingTop: 56, paddingBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.bw}</div>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0 6px", color: C.ink }}>{t.bh}</h2>
          <p style={{ color: C.second, maxWidth: 560, margin: "0 auto 36px", fontSize: 15 }}>{t.bl}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
            {[[t.s1t, t.s1p], [t.s2t, t.s2p], [t.s3t, t.s3p]].map((s, i) => (
              <div key={i} className="card" style={{ background: C.white, border: "1px solid rgba(22,41,76,.08)", borderRadius: 18, padding: "24px 20px", boxShadow: "0 10px 30px rgba(22,41,76,.06)", position: "relative", textAlign: "left" }}>
                <div style={{ position: "absolute", top: 14, right: 18, fontFamily: "'Cormorant Garamond',serif", fontSize: 42, fontWeight: 700, color: "rgba(201,162,75,.28)" }}>{i + 1}</div>
                <h3 className="serif" style={{ fontSize: 24, color: C.ink, margin: "0 0 5px" }}>{s[0]}</h3>
                <p style={{ color: C.second, fontSize: 14, lineHeight: 1.5, margin: 0 }}>{s[1]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="wrap" style={{ paddingTop: 44, paddingBottom: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.pw}</div>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0 6px", color: C.ink }}>{t.ph}</h2>
          <p style={{ color: C.second, maxWidth: 580, margin: "0 auto 36px", fontSize: 15 }}>{t.pl}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, alignItems: "stretch" }}>
            {t.tiers.map((tier, i) => (
              <div key={i} style={{ background: C.white, border: tier.feat ? `2px solid ${C.gold}` : "1px solid rgba(22,41,76,.1)", borderRadius: 18, padding: "24px 20px", position: "relative", textAlign: "left", boxShadow: tier.feat ? "0 16px 40px rgba(201,162,75,.16)" : "none", display: "flex", flexDirection: "column" }}>
                {tier.feat && <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: C.gold, color: C.ink, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" }}>{t.popular}</span>}
                <span style={{ alignSelf: "flex-start", fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.second, background: "rgba(22,41,76,.07)", padding: "3px 9px", borderRadius: 999, marginBottom: 10 }}>{t.cs}</span>
                <h3 className="serif" style={{ fontSize: 24, color: C.ink, margin: 0 }}>{tier.n}</h3>
                <div style={{ fontSize: 30, fontWeight: 700, color: C.ink, margin: "6px 0 2px" }}>{tier.a}{tier.per && <small style={{ fontSize: 13, color: C.second, fontWeight: 500 }}> {tier.per}</small>}</div>
                <div style={{ color: C.second, fontSize: 12.5 }}>{tier.s}</div>
                <ul style={{ color: C.second, fontSize: 13, lineHeight: 1.7, marginTop: 12, listStyle: "none", padding: 0 }}>
                  {tier.f.map((x, j) => <li key={j} style={{ paddingLeft: 20, position: "relative" }}><span style={{ position: "absolute", left: 0, color: C.gold, fontWeight: 700 }}>✓</span>{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <p style={{ color: C.second, fontSize: 12, marginTop: 18 }}>{t.pn}</p>
        </section>

        {/* FORM */}
        <section className="wrap" style={{ paddingTop: 24, paddingBottom: 56 }}>
          <div ref={formRef} style={{ background: C.ink, color: C.bg, borderRadius: 24, padding: 42, scrollMarginTop: 80 }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%", border: `3px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.goldLight, fontSize: 26 }}>✓</div>
                <h2 className="serif" style={{ fontSize: 32, margin: "0 0 6px" }}>{t.okh}</h2>
                <p style={{ color: "#cdd6e3", fontSize: 14, maxWidth: 460, margin: "0 auto" }}>{t.okp}</p>
              </div>
            ) : (
              <>
                <h2 className="serif" style={{ fontSize: 34, textAlign: "center", margin: 0 }}>{t.fh}</h2>
                <p style={{ textAlign: "center", color: "#cdd6e3", fontSize: 14, maxWidth: 520, margin: "8px auto 26px" }}>{t.fs}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, maxWidth: 620, margin: "0 auto" }}>
                  <input style={inp} placeholder={t.phC} value={f.church} onChange={upd("church")} />
                  <input style={inp} placeholder={t.phN} value={f.name} onChange={upd("name")} />
                  <input style={inp} type="email" placeholder={t.phE} value={f.email} onChange={upd("email")} />
                  <input style={inp} placeholder={t.phS} value={f.size} onChange={upd("size")} />
                  <input style={{ ...inp, gridColumn: "1 / -1" }} placeholder={t.phEv} value={f.eventType} onChange={upd("eventType")} />
                  <input style={{ ...inp, gridColumn: "1 / -1" }} placeholder={t.phP} value={f.budget} onChange={upd("budget")} />
                  {err && <div style={{ gridColumn: "1 / -1", color: "#f2b8b5", fontSize: 13 }}>{err}</div>}
                  <button onClick={submit} disabled={sending} style={{ gridColumn: "1 / -1", background: C.gold, color: C.ink, border: 0, borderRadius: 12, padding: 14, fontSize: 15, fontWeight: 600, opacity: sending ? 0.6 : 1 }}>{sending ? t.fsending : t.fsub}</button>
                </div>
                <div style={{ textAlign: "center", fontSize: 11, color: "#8ea0c1", marginTop: 12 }}>{t.fp}</div>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
