import React, { useState, useRef, useEffect } from "react";
import { Header } from "../components/UI.jsx";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

const COPY = {
  en: {
    early: "Request early access", cs: "Coming soon",
    h1: "Every moment, gathered.",
    hp: "The effortless way to collect, curate, and share every photo from your event. Guests scan one code — HALO keeps the best shots, edits them, and delivers stunning galleries plus a live slideshow on screen. For weddings, quinceañeras, churches, businesses, and every celebration in between.",
    see: "See how it works",
    note: "Founding members get early access + locked-in founding pricing.",
    uw: "Made for every moment", uh: "One tool for every kind of gathering",
    uses: ["Weddings", "Quinceañeras", "Birthdays & anniversaries", "Church & ministry", "Graduations", "Corporate & conferences", "Galas & fundraisers", "Non-profits"],
    bw: "The basics", bh: "Three steps to a full gallery", bl: "No sign-ups, no app downloads. Just a code and a camera.",
    s1t: "Scan the code", s1p: "Print or project the QR. Anyone points their phone — opens instantly, no app, no account.",
    s2t: "Capture & upload", s2p: "Everyone shares what they shoot. HALO keeps the sharp, well-lit moments and edits them automatically.",
    s3t: "Relive & share", s3p: "Private galleries for every guest, a live slideshow on screen, and originals ready to post.",
    proof: "Every guest becomes your photographer. HALO gathers the best shots automatically.",
    pills: ["No app required", "English / Spanish", "You own every photo", "Live in 24–48h"],
    pw: "Founding pricing", ph: "Simple plans, coming soon",
    pl: "Start free, host all year for a low monthly, or add a premium pack for the big days. Early members lock in founding rates.",
    popular: "Most popular",
    tiers: [
      { n: "First event", a: "Free", s: "Try HALO with zero risk", f: ["One full event", "Auto-curated galleries", "Live slideshow"] },
      { n: "Unlimited", a: "$19", per: "/mo", s: "Host events all year", f: ["Unlimited events", "Your branding", "Bilingual + all features"], feat: true },
      { n: "Premium pack", a: "$49", per: "/event", s: "For weddings, quinces & big days", f: ["Auto highlight-reel video", "Branded social graphics", "Done-for-you setup"] },
      { n: "Pro", a: "$99", per: "/mo", s: "Teams, venues & agencies", f: ["Multiple live events", "White-label", "Priority support"] },
    ],
    pn: "Pricing is indicative and may change at launch. Founding members keep their early rate.",
    fw: "Questions", fh: "Good to know",
    faq: [
      ["Do guests need an app?", "No. They scan the code and it opens in their browser — nothing to download, no accounts to create."],
      ["Who owns the photos?", "You do. Download the full-resolution originals anytime. Nothing is public unless you choose to publish it."],
      ["Is it really bilingual?", "Yes — the entire experience flips between English and Spanish with a single tap."],
      ["Is it safe for kids?", "Yes. A consent-first gate and review controls mean nothing appears publicly or on the screen until you approve it."],
      ["What events is it for?", "Weddings, quinceañeras, birthdays, church services, graduations, corporate events, galas, fundraisers — any gathering."],
      ["How fast can we start?", "We can have your event live in 24–48 hours, QR code and all."],
    ],
    fh2: "Be a founding member", fs: "Tell us about your event and we'll reach out with early access and founding pricing as soon as we launch.",
    phC: "Organization / host name", phN: "Your name", phE: "Email", phS: "Guest count (approx.)", phEv: "What's the occasion? (e.g. wedding, quinceañera, gala)", phP: "What would you expect to pay? (optional)",
    fsub: "Request early access", fsending: "Sending…", fp: "No spam. We'll only use this to contact you about HALO.",
    okh: "Thank you!", okp: "We've got your request — we'll reach out with early access and founding pricing soon. Check your inbox for a confirmation.",
    err: "Something went wrong. Please try again.",
    foot: "HALO by Finesse Media · Every moment, beautifully gathered",
  },
  es: {
    early: "Solicitar acceso anticipado", cs: "Próximamente",
    h1: "Cada momento, reunido.",
    hp: "La forma sencilla de reunir, curar y compartir cada foto de tu evento. Los invitados escanean un código — HALO conserva las mejores tomas, las edita y entrega galerías impresionantes y una presentación en vivo en pantalla. Para bodas, quinceañeras, iglesias, negocios y cada celebración.",
    see: "Ver cómo funciona",
    note: "Los miembros fundadores obtienen acceso anticipado y precio fundador asegurado.",
    uw: "Hecho para cada momento", uh: "Una herramienta para todo tipo de encuentro",
    uses: ["Bodas", "Quinceañeras", "Cumpleaños y aniversarios", "Iglesia y ministerio", "Graduaciones", "Corporativo y conferencias", "Galas y recaudaciones", "Organizaciones sin fines de lucro"],
    bw: "Lo básico", bh: "Tres pasos para una galería completa", bl: "Sin registros, sin descargas. Solo un código y una cámara.",
    s1t: "Escanea el código", s1p: "Imprime o proyecta el QR. Cualquiera apunta su teléfono — abre al instante, sin app, sin cuenta.",
    s2t: "Captura y sube", s2p: "Todos comparten lo que toman. HALO conserva los momentos nítidos y bien iluminados y los edita automáticamente.",
    s3t: "Revive y comparte", s3p: "Galerías privadas para cada invitado, una presentación en vivo en pantalla, y originales listos para publicar.",
    proof: "Cada invitado se vuelve tu fotógrafo. HALO reúne las mejores tomas automáticamente.",
    pills: ["Sin aplicación", "Inglés / Español", "Tú eres dueño de cada foto", "Listo en 24–48h"],
    pw: "Precio fundador", ph: "Planes simples, próximamente",
    pl: "Empieza gratis, organiza todo el año por una mensualidad baja, o agrega un paquete premium para los grandes días. Los miembros tempranos aseguran tarifas fundadoras.",
    popular: "Más popular",
    tiers: [
      { n: "Primer evento", a: "Gratis", s: "Prueba HALO sin riesgo", f: ["Un evento completo", "Galerías auto-curadas", "Presentación en vivo"] },
      { n: "Ilimitado", a: "$19", per: "/mes", s: "Organiza eventos todo el año", f: ["Eventos ilimitados", "Tu marca", "Bilingüe + todo incluido"], feat: true },
      { n: "Paquete premium", a: "$49", per: "/evento", s: "Para bodas, quinces y grandes días", f: ["Video destacado automático", "Gráficas para redes con tu marca", "Configuración lista para usar"] },
      { n: "Pro", a: "$99", per: "/mes", s: "Equipos, venues y agencias", f: ["Múltiples eventos en vivo", "Marca blanca", "Soporte prioritario"] },
    ],
    pn: "El precio es indicativo y puede cambiar al lanzamiento. Los miembros fundadores mantienen su tarifa temprana.",
    fw: "Preguntas", fh: "Bueno saberlo",
    faq: [
      ["¿Los invitados necesitan una app?", "No. Escanean el código y abre en su navegador — nada que descargar, sin cuentas."],
      ["¿Quién es dueño de las fotos?", "Tú. Descarga los originales en alta resolución cuando quieras. Nada es público hasta que decidas publicarlo."],
      ["¿Es realmente bilingüe?", "Sí — toda la experiencia cambia entre inglés y español con un solo toque."],
      ["¿Es seguro para los niños?", "Sí. Una protección por consentimiento y controles de revisión aseguran que nada aparezca públicamente ni en pantalla hasta que lo apruebes."],
      ["¿Para qué eventos es?", "Bodas, quinceañeras, cumpleaños, servicios de iglesia, graduaciones, eventos corporativos, galas, recaudaciones — cualquier encuentro."],
      ["¿Qué tan rápido podemos empezar?", "Podemos tener tu evento listo en 24–48 horas, con código QR incluido."],
    ],
    fh2: "Sé un miembro fundador", fs: "Cuéntanos sobre tu evento y te contactaremos con acceso anticipado y precio fundador en cuanto lancemos.",
    phC: "Organización / anfitrión", phN: "Tu nombre", phE: "Correo electrónico", phS: "Número de invitados (aprox.)", phEv: "¿Cuál es la ocasión? (ej. boda, quinceañera, gala)", phP: "¿Cuánto esperarías pagar? (opcional)",
    fsub: "Solicitar acceso anticipado", fsending: "Enviando…", fp: "Sin spam. Solo usaremos esto para contactarte sobre HALO.",
    okh: "¡Gracias!", okp: "Recibimos tu solicitud — te contactaremos con acceso anticipado y precio fundador muy pronto. Revisa tu correo para una confirmación.",
    err: "Algo salió mal. Inténtalo de nuevo.",
    foot: "HALO by Finesse Media · Cada momento, bellamente reunido",
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
  const [heroImgs, setHeroImgs] = useState(["/halo-hero.jpg"]);
  const [heroIdx, setHeroIdx] = useState(0);
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

  // Load admin-managed hero carousel images (falls back to the default image)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("hero_images").select("*").eq("active", true).order("sort", { ascending: true });
      const urls = (data || []).map((r) => publicUrl(r.storage_path)).filter(Boolean);
      if (urls.length) { setHeroImgs(urls); setHeroIdx(0); }
    })();
  }, []);
  useEffect(() => {
    if (heroImgs.length < 2) return;
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % heroImgs.length), 6000);
    return () => clearInterval(id);
  }, [heroImgs]);

  const inp = { width: "100%", padding: "13px 14px", borderRadius: 11, border: "1px solid rgba(244,238,223,.25)", background: "rgba(244,238,223,.06)", color: C.bg, fontSize: 14, fontFamily: "Manrope, sans-serif" };
  const cardTop = { borderTop: `4px solid ${C.gold}` };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header right={<button onClick={scrollToForm} style={{ background: C.gold, color: C.ink, borderRadius: 999, padding: "9px 16px", fontSize: 12, fontWeight: 600 }}>{t.early}</button>} />

      {/* HERO — admin-managed image carousel + overlay */}
      <div style={{ position: "relative", overflow: "hidden", color: C.bg, padding: "64px 24px 88px", textAlign: "center" }}>
        {heroImgs.map((src, i) => (
          <div key={i} aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center", opacity: i === heroIdx ? 1 : 0, transition: "opacity 1.2s ease" }} />
        ))}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(125deg, rgba(14,27,54,.77), rgba(27,52,100,.77) 55%, rgba(38,70,112,.77))" }} />
        <div style={{ position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)", width: 340, height: 340, background: "radial-gradient(circle, rgba(230,200,121,.20), transparent 62%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 2 }}>
          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.inkDeep, background: C.goldLight, padding: "6px 16px", borderRadius: 999 }}>{t.cs}</span>
          <h1 className="serif" style={{ fontSize: 54, lineHeight: 1.04, margin: "20px 0 12px", fontWeight: 700 }}>{t.h1}</h1>
          <p style={{ maxWidth: 620, margin: "0 auto", fontSize: 17, color: "#dbe3ee", lineHeight: 1.55 }}>{t.hp}</p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 28, flexWrap: "wrap" }}>
            <button onClick={scrollToForm} style={{ background: C.gold, color: C.ink, border: 0, borderRadius: 12, padding: "14px 26px", fontSize: 15, fontWeight: 600 }}>{t.early}</button>
            <a href="#basics" style={{ textDecoration: "none" }}><button style={{ background: "transparent", color: C.bg, border: "1px solid rgba(244,238,223,.45)", borderRadius: 12, padding: "14px 26px", fontSize: 15, fontWeight: 600 }}>{t.see}</button></a>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: C.goldLight, letterSpacing: 1 }}>{t.note}</div>
          {heroImgs.length > 1 && (
            <div style={{ display: "flex", gap: 7, justifyContent: "center", marginTop: 22 }}>
              {heroImgs.map((_, i) => (
                <button key={i} onClick={() => setHeroIdx(i)} aria-label={`Slide ${i + 1}`} style={{ width: 9, height: 9, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: i === heroIdx ? C.gold : "rgba(244,238,223,.45)" }} />
              ))}
            </div>
          )}
        </div>
      </div>

      <main style={{ flex: 1 }}>
        {/* USE CASES */}
        <section className="wrap" style={{ paddingTop: 52, paddingBottom: 10, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.uw}</div>
          <h2 className="serif" style={{ fontSize: 36, margin: "8px 0 26px", color: C.ink }}>{t.uh}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
            {t.uses.map((u, i) => (
              <div key={i} style={{ background: C.white, border: "1px solid rgba(22,41,76,.10)", borderTop: `4px solid ${C.gold}`, borderRadius: 14, padding: "18px 12px", fontSize: 14, fontWeight: 600, color: C.ink, boxShadow: "0 12px 28px rgba(22,41,76,.10)" }}>{u}</div>
            ))}
          </div>
        </section>

        {/* BASICS */}
        <section id="basics" className="wrap" style={{ paddingTop: 48, paddingBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.bw}</div>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0 6px", color: C.ink }}>{t.bh}</h2>
          <p style={{ color: C.second, maxWidth: 560, margin: "0 auto 36px", fontSize: 15 }}>{t.bl}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
            {[[t.s1t, t.s1p], [t.s2t, t.s2p], [t.s3t, t.s3p]].map((s, i) => (
              <div key={i} className="card" style={{ background: C.white, border: "1px solid rgba(22,41,76,.10)", ...cardTop, borderRadius: 16, padding: "26px 22px", boxShadow: "0 14px 34px rgba(22,41,76,.12)", position: "relative", textAlign: "left" }}>
                <div style={{ position: "absolute", top: 14, right: 18, fontFamily: "'Cormorant Garamond',serif", fontSize: 42, fontWeight: 700, color: "rgba(201,162,75,.28)" }}>{i + 1}</div>
                <h3 className="serif" style={{ fontSize: 24, color: C.ink, margin: "0 0 5px" }}>{s[0]}</h3>
                <p style={{ color: C.second, fontSize: 14, lineHeight: 1.5, margin: 0 }}>{s[1]}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PROOF BAND */}
        <section className="wrap" style={{ paddingTop: 20, paddingBottom: 20 }}>
          <div style={{ background: C.ink, color: C.bg, borderRadius: 18, padding: "26px 24px", textAlign: "center" }}>
            <p className="serif" style={{ fontSize: 22, margin: "0 0 14px", color: C.bg }}>{t.proof}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
              {t.pills.map((p, i) => (
                <span key={i} style={{ background: "rgba(230,200,121,.14)", color: C.goldLight, border: "1px solid rgba(230,200,121,.35)", borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600 }}>{p}</span>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="wrap" style={{ paddingTop: 28, paddingBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.pw}</div>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0 6px", color: C.ink }}>{t.ph}</h2>
          <p style={{ color: C.second, maxWidth: 600, margin: "0 auto 36px", fontSize: 15 }}>{t.pl}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, alignItems: "stretch" }}>
            {t.tiers.map((tier, i) => (
              <div key={i} style={{ background: C.white, border: tier.feat ? `2px solid ${C.gold}` : "1px solid rgba(22,41,76,.10)", ...cardTop, borderRadius: 16, padding: "26px 22px", position: "relative", textAlign: "left", boxShadow: tier.feat ? "0 18px 44px rgba(201,162,75,.20)" : "0 12px 30px rgba(22,41,76,.10)", display: "flex", flexDirection: "column" }}>
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

        {/* FAQ */}
        <section className="wrap" style={{ paddingTop: 28, paddingBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: C.gold }}>{t.fw}</div>
          <h2 className="serif" style={{ fontSize: 38, margin: "8px 0 26px", color: C.ink }}>{t.fh}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, textAlign: "left" }}>
            {t.faq.map((q, i) => (
              <div key={i} style={{ background: C.white, border: "1px solid rgba(22,41,76,.10)", borderTop: `4px solid ${C.gold}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 12px 28px rgba(22,41,76,.10)" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{q[0]}</div>
                <div style={{ fontSize: 14, color: C.second, lineHeight: 1.55 }}>{q[1]}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FORM */}
        <section className="wrap" style={{ paddingTop: 28, paddingBottom: 48 }}>
          <div ref={formRef} style={{ background: C.ink, color: C.bg, borderRadius: 24, padding: 42, scrollMarginTop: 80 }}>
            {done ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <div style={{ width: 56, height: 56, margin: "0 auto 14px", borderRadius: "50%", border: `3px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.goldLight, fontSize: 26 }}>✓</div>
                <h2 className="serif" style={{ fontSize: 32, margin: "0 0 6px" }}>{t.okh}</h2>
                <p style={{ color: "#cdd6e3", fontSize: 14, maxWidth: 460, margin: "0 auto" }}>{t.okp}</p>
              </div>
            ) : (
              <>
                <h2 className="serif" style={{ fontSize: 34, textAlign: "center", margin: 0 }}>{t.fh2}</h2>
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

      {/* UNIVERSAL FOOTER */}
      <footer style={{ textAlign: "center", padding: 22, color: C.second, fontSize: 12 }}>{t.foot} · <a href="/legal" style={{ color: C.second }}>{lang === "es" ? "T\u00e9rminos y Privacidad" : "Terms & Privacy"}</a></footer>
    </div>
  );
}
