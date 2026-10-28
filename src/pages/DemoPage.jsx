// HALO — public "try it" demo (/demo).
//
// A self-contained sandbox: the visitor snaps or picks a photo on the left
// (a guest's phone) and watches it land on the live wall on the right, with
// animated hearts and likes, a photo challenge and a guestbook message.
// Nothing is uploaded: photos stay on the visitor's own device as object
// URLs, so strangers can never put anything on a public screen.
import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { LangToggle } from "../components/UI.jsx";
import { CameraIcon, UploadIcon } from "../components/Icons.jsx";
import { ReactionBuddy, LIVE_REACTION_CSS } from "../components/LiveReactions.jsx";
import { DEFAULT_CHALLENGES, challengeText } from "../lib/challenges.js";

const SAMPLES = ["group-selfie", "couple-portrait", "birthday-dinner", "grand-exit", "church-doors", "phones-couple", "pink-blazer", "bridesmaid-phone"]
  .map((n, i) => ({ id: "s" + i, url: `/landing/images/moments/${n}.webp`, by: ["Ana", "Marcus", "Tía Carmen", "Jordan", "Luis", "Priya", "Grace", "Sam"][i] }));
const HOLD = 3800;

export default function DemoPage() {
  const { t, lang } = useI18n();
  const [mine, setMine] = useState([]);           // the visitor's photos: { id, url, by, challenge }
  const [idx, setIdx] = useState(0);
  const queueRef = useRef([]);                    // ids to show next (new uploads jump the line)
  const [floaters, setFloaters] = useState([]);
  const [wish, setWish] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [toast, setToast] = useState("");
  const [qr, setQr] = useState(null);
  const camRef = useRef(null), libRef = useRef(null);
  const slides = [...mine, ...SAMPLES];
  const byId = Object.fromEntries(slides.map((s) => [s.id, s]));
  const [curId, setCurId] = useState(SAMPLES[0].id);
  const cur = byId[curId] || SAMPLES[0];
  const steps = useRef(0);

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/demo`, { width: 360, margin: 1, color: { dark: "#16294C", light: "#ffffff" } }).then(setQr).catch(() => {});
    return () => mine.forEach((m) => URL.revokeObjectURL(m.url));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // advance the wall; every 5th step a guestbook card instead
  useEffect(() => {
    const tmr = setTimeout(() => {
      steps.current += 1;
      if (steps.current % 5 === 0 && !wish) { setWish({ text: t("demo.wishText"), by: "Abuela Rosa" }); setTimeout(() => setWish(null), 4200); return; }
      if (queueRef.current.length) { setCurId(queueRef.current.shift()); return; }
      const next = (idx + 1) % slides.length; setIdx(next); setCurId(slides[next].id);
    }, HOLD);
    return () => clearTimeout(tmr);
  }, [curId, idx, slides.length, wish]); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list) {
    const files = Array.from(list || []).filter((f) => f.type.startsWith("image/")).slice(0, 6);
    if (!files.length) return;
    const added = files.map((f, i) => ({ id: `m${Date.now()}-${i}`, url: URL.createObjectURL(f), by: t("demo.you"), challenge }));
    setMine((m) => [...added, ...m]);
    setCurId(added[0].id);
    queueRef.current = [...added.slice(1).map((a) => a.id), ...queueRef.current];
    setWish(null);
    setChallenge(null);
    setToast(t("demo.onScreen"));
    setTimeout(() => setToast(""), 3200);
  }

  function react(kind) {
    const now = Date.now();
    const batch = Array.from({ length: 3 }, (_, i) => ({ id: `${now}-${i}`, kind, x: 10 + Math.random() * 70, size: 13 + Math.random() * 6, drift: (Math.random() - 0.5) * 30, delay: i * 0.18 }));
    setFloaters((f) => [...f, ...batch].slice(-18));
    setTimeout(() => setFloaters((f) => f.filter((h) => !batch.some((b) => b.id === h.id))), 5200);
  }

  const ch = cur.challenge ? DEFAULT_CHALLENGES.find((c) => c.id === cur.challenge) : null;

  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(120% 60% at 50% -10%, rgba(123,47,247,.22), transparent 60%), #0a0410", color: "#fff" }}>
      <style>{LIVE_REACTION_CSS + DEMO_CSS}</style>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 16px 48px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <a href="/" style={{ display: "inline-flex" }}><img src="/halo-logo.png" alt="HALO" style={{ height: 30, width: "auto" }} /></a>
          <div style={{ marginLeft: "auto" }}><LangToggle /></div>
        </div>

        <p className="eyebrow" style={{ textAlign: "center", margin: 0 }}>{t("demo.eyebrow")}</p>
        <h1 className="serif" style={{ textAlign: "center", fontStyle: "italic", fontWeight: 600, fontSize: "clamp(30px, 6vw, 54px)", lineHeight: 1.05, margin: "8px 0 8px" }}>{t("demo.title")}</h1>
        <p style={{ textAlign: "center", color: "#c9c2d4", maxWidth: 620, margin: "0 auto 26px", fontSize: 15, lineHeight: 1.5 }}>{t("demo.sub")}</p>

        <div className="demo-grid">
          {/* The guest's phone */}
          <div className="demo-phone">
            <div style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: C.gold, fontWeight: 800, marginBottom: 10 }}>{t("demo.phoneLabel")}</div>
            <div style={{ background: "#120a19", border: "1px solid rgba(255,255,255,.12)", borderRadius: 28, padding: "18px 16px", boxShadow: "0 24px 60px rgba(0,0,0,.5)" }}>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15 }}>Stephen &amp; Sandra</div>
              <div style={{ textAlign: "center", color: "#b9b2c4", fontSize: 11.5, margin: "2px 0 14px" }}>{t("demo.phoneSub")}</div>
              <button type="button" onClick={() => camRef.current?.click()} style={{ display: "block", width: "100%", background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: "4px 0 10px" }}>
                <span style={{ width: 66, height: 66, margin: "0 auto", borderRadius: "50%", background: C.gold, color: "#1a0f0a", display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(255,184,107,.35)" }}><CameraIcon size={28} /></span>
                <span style={{ display: "block", fontWeight: 800, fontSize: 17, marginTop: 8 }}>{t("up.takePhoto")}</span>
              </button>
              <div style={{ textAlign: "center" }}>
                <button type="button" onClick={() => libRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.06)", color: "#fff", border: "1px solid rgba(255,255,255,.18)", padding: "10px 16px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
                  <UploadIcon size={17} /> {t("up.fromLibrary")}
                </button>
              </div>
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={libRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />

              <div style={{ fontWeight: 800, fontSize: 13.5, margin: "16px 0 8px" }}>{t("ch.title")}</div>
              <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                {DEFAULT_CHALLENGES.slice(0, 4).map((c) => (
                  <button key={c.id} type="button" onClick={() => { setChallenge(c.id); camRef.current?.click(); }}
                    style={{ flex: "0 0 auto", width: 128, textAlign: "left", background: challenge === c.id ? "rgba(255,184,107,.18)" : "rgba(255,255,255,.06)", border: `1px solid ${challenge === c.id ? C.gold : "rgba(255,255,255,.16)"}`, borderRadius: 12, padding: "9px 10px", color: "#fff", fontSize: 12, fontWeight: 700, lineHeight: 1.25, cursor: "pointer" }}>
                    {challengeText(c, lang)}
                  </button>
                ))}
              </div>

              <div style={{ fontWeight: 800, fontSize: 13.5, margin: "16px 0 8px" }}>{t("demo.reactLabel")}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => react("heart")} aria-label={t("react.heart")} style={reactBtn}><span style={{ width: 34, height: 34, display: "block" }}><ReactionBuddy kind="heart" /></span>{t("demo.heart")}</button>
                <button type="button" onClick={() => react("like")} aria-label={t("react.like")} style={reactBtn}><span style={{ width: 34, height: 34, display: "block" }}><ReactionBuddy kind="like" /></span>{t("demo.like")}</button>
              </div>
              {toast && <div role="status" style={{ marginTop: 14, background: "rgba(255,61,129,.14)", border: "1px solid rgba(255,61,129,.45)", borderRadius: 12, padding: "10px 12px", fontSize: 13, fontWeight: 700, textAlign: "center" }}>{toast}</div>}
            </div>
            <p style={{ fontSize: 11.5, color: "#9d95ab", textAlign: "center", margin: "10px 0 0" }}>{t("demo.private")}</p>
          </div>

          {/* The live wall */}
          <div className="demo-wall-col">
            <div style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: C.gold, fontWeight: 800, marginBottom: 10 }}>{t("demo.wallLabel")}</div>
            <div className="demo-wall">
              <img key={cur.id} src={cur.url} alt="" className="demo-slide" />
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(10,4,16,.55) 100%)" }} />
              <div style={{ position: "absolute", top: "4%", left: "3%", display: "flex", alignItems: "center", gap: 8, fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(11px, 1.5vw, 17px)", textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>
                <span style={{ width: "1.7em", height: "1.7em", borderRadius: "50%", border: `2px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontSize: ".8em" }}>&#9673;</span>
                Stephen &amp; Sandra
              </div>
              {ch && (
                <div style={{ position: "absolute", left: "50%", bottom: "6%", transform: "translateX(-50%)", background: "rgba(10,4,16,.66)", border: `1px solid ${C.gold}`, borderRadius: 14, padding: "6px 14px", textAlign: "center", maxWidth: "80%" }}>
                  <div style={{ color: C.gold, fontSize: "clamp(8px, 1vw, 11px)", fontWeight: 800, letterSpacing: ".25em", textTransform: "uppercase" }}>{t("live.challenge")}</div>
                  <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: "clamp(12px, 1.8vw, 20px)" }}>{challengeText(ch, lang)}</div>
                </div>
              )}
              <div style={{ position: "absolute", right: "3%", bottom: "5%", background: "rgba(10,4,16,.6)", borderRadius: 999, padding: "4px 10px", fontSize: "clamp(10px, 1.2vw, 13px)", fontWeight: 700, display: ch ? "none" : "block" }}>{t("live.by")} {cur.by}</div>
              {floaters.map((h) => (
                <div key={h.id} className="rx-float demo-float" style={{ left: `${h.x}%`, width: `${h.size}%`, aspectRatio: "1 / 1", height: "auto", "--drift": `${h.drift}%`, "--dur": "4.4s", animationDelay: `${h.delay}s` }}>
                  <ReactionBuddy kind={h.kind} />
                </div>
              ))}
              {wish && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(10,4,16,.86)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", animation: "fadeIn .7s ease", padding: "0 8%" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: "clamp(15px, 2.8vw, 30px)", lineHeight: 1.3 }}>&ldquo;{wish.text}&rdquo;</div>
                    <div style={{ color: C.gold, fontWeight: 700, fontSize: "clamp(10px, 1.3vw, 14px)", marginTop: 10 }}>{t("live.wishFrom")} {wish.by}</div>
                  </div>
                </div>
              )}
            </div>
            <div className="demo-features">
              {["f1", "f2", "f3", "f4"].map((k) => (
                <div key={k} style={{ background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, color: "#ddd6e6", lineHeight: 1.4 }}>{t("demo." + k)}</div>
              ))}
            </div>
            {qr && (
              <div className="demo-qr">
                <img src={qr} alt="" width="96" height="96" style={{ borderRadius: 10, background: "#fff" }} />
                <div style={{ fontSize: 13, color: "#ddd6e6", lineHeight: 1.45 }}>{t("demo.qr")}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 34 }}>
          <a href="/signup" style={{ textDecoration: "none" }}>
            <button type="button" style={{ background: C.gold, color: "#1a0f0a", border: "none", borderRadius: 999, padding: "14px 28px", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>{t("demo.cta")}</button>
          </a>
          <div style={{ color: "#9d95ab", fontSize: 12.5, marginTop: 10 }}>{t("demo.ctaSub")}</div>
        </div>
      </div>
    </div>
  );
}

const reactBtn = { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "rgba(255,255,255,.06)", color: "#fff", border: "1px solid rgba(255,255,255,.16)", borderRadius: 14, padding: "6px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer" };

const DEMO_CSS = `
  .demo-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 28px; align-items: start; }
  .demo-grid > * { min-width: 0; }
  .demo-wall { position: relative; aspect-ratio: 16 / 9; border-radius: 18px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 30px 80px rgba(0,0,0,.55); }
  .demo-slide { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; animation: demoIn .9s ease, demoKb 6s ease-out forwards; }
  .demo-features { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 14px; }
  .demo-qr { display: flex; align-items: center; gap: 14px; margin-top: 14px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 12px; }
  .demo-float { bottom: -18%; }
  .demo-wall .rx-float { animation-name: rxRiseBox; }
  @keyframes rxRiseBox { 0% { opacity: 0; transform: translate(0,0) } 10% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--drift), -520%) } }
  @keyframes demoIn { from { opacity: 0 } to { opacity: 1 } }
  @keyframes demoKb { from { transform: scale(1.02) } to { transform: scale(1.09) } }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  @media (max-width: 860px) {
    .demo-grid { grid-template-columns: minmax(0, 1fr); }
    .demo-wall-col { order: -1; position: sticky; top: 0; z-index: 5; background: #0a0410; padding: 8px 0 10px; margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
    .demo-wall-col .demo-features { display: none; }
    .demo-features { grid-template-columns: 1fr 1fr; }
    .demo-qr { display: none; }
  }
`;
