import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { fetchReactions, like } from "../lib/reactions.js";
import { useI18n } from "../lib/i18n.jsx";

// Slideshow music: explicit choice wins; otherwise auto-match by event type.
const CAT_MUSIC = { wedding: "/music/elegant.mp3", quinceanera: "/music/uplifting.mp3", church: "/music/worship.mp3", corporate: "/music/uplifting.mp3", gala: "/music/elegant.mp3", other: "/music/elegant.mp3" };
function resolveMusic(ev) {
  if (!ev) return null;
  const m = ev.music_url;
  if (m === "none") return null;
  if (m) return (m.startsWith("/") || m.startsWith("http")) ? m : publicUrl(m);
  return CAT_MUSIC[ev.category] || null;
}

// HALO Live — a projector-ready slideshow of approved, kept photos.
// Auto-advances with a slow Ken Burns drift, cross-fades between shots,
// polls for new uploads, shows live heart counts, and spotlights the
// admin-pinned "Moment of the Service".
export default function SlideshowPage() {
  const { t, ev } = useI18n();
  const { code } = useParams();
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const [counts, setCounts] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const seen = useRef(new Set());
  const chromeTimer = useRef(null);
  const eventRef = useRef(null);
  const audioRef = useRef(null);
  const [musicOn, setMusicOn] = useState(false);

  const HOLD = 6500; // ms per photo

  // load event + initial photos
  useEffect(() => {
    (async () => {
      const { data: evrow } = await supabase.from("events").select("*").eq("code", code).single();
      setEvent(evrow || false);
      eventRef.current = evrow || null;
      if (evrow) await refresh(evrow.id, true);
      setReady(true);
    })();
  }, [code]);

  const refresh = useCallback(async (eventId, initial = false) => {
    let q = supabase.from("photos").select("*")
      .eq("event_id", eventId).eq("kept", true).eq("status", "approved");
    const session = eventRef.current && eventRef.current.current_session;
    if (session) q = q.eq("session_label", session); // V2: current weekly session only
    const { data } = await q.order("created_at", { ascending: true });
    const mapped = (data || []).map((p) => ({
      ...p,
      url: p.edited_path ? publicUrl(p.edited_path) : publicUrl(p.storage_path),
    }));
    if (initial) {
      mapped.forEach((p) => seen.current.add(p.id));
      setPhotos(shuffle(mapped));
    } else {
      const fresh = mapped.filter((p) => !seen.current.has(p.id));
      if (fresh.length) {
        fresh.forEach((p) => seen.current.add(p.id));
        setPhotos((prev) => {
          const copy = [...prev];
          copy.splice(idx + 1, 0, ...fresh);
          return copy;
        });
      }
    }
  }, [idx]);

  // poll for new uploads every 12s
  useEffect(() => {
    if (!event) return;
    const tmr = setInterval(() => refresh(event.id, false), 12000);
    return () => clearInterval(tmr);
  }, [event, refresh]);

  // keep heart counts fresh as photos arrive (and on first load)
  useEffect(() => {
    if (!event || photos.length === 0) return;
    let alive = true;
    fetchReactions(photos.map((p) => p.id)).then((r) => { if (alive) { setCounts(r.counts); setLiked(r.liked); } });
    return () => { alive = false; };
  }, [event, photos.length]);

  // advance timer
  useEffect(() => {
    if (paused || photos.length < 2) return;
    const tmr = setTimeout(() => go(1), HOLD);
    return () => clearTimeout(tmr);
  }, [idx, paused, photos.length]);

  function go(dir) {
    setPhotos((cur) => {
      if (cur.length === 0) return cur;
      setPrevIdx(idx);
      setIdx((i) => (i + dir + cur.length) % cur.length);
      return cur;
    });
  }

  function toggleMusic() {
    const a = audioRef.current;
    if (!a) return;
    if (musicOn) { a.pause(); setMusicOn(false); }
    else { a.volume = 0.6; a.play().then(() => setMusicOn(true)).catch(() => {}); }
  }

  async function likeCurrent() {
    const cur = photos[idx];
    if (!cur || !event || liked.has(cur.id)) return;
    setLiked((prev) => new Set(prev).add(cur.id));
    setCounts((prev) => ({ ...prev, [cur.id]: (prev[cur.id] || 0) + 1 }));
    try { await like(cur.id, event.id); } catch { /* keep optimistic */ }
  }

  // keyboard + auto-hide chrome
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === "f") toggleFull();
      else if (e.key.toLowerCase() === "h") likeCurrent();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, photos, liked, event]);

  function wake() {
    setShowChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setShowChrome(false), 3500);
  }
  useEffect(() => { wake(); return () => clearTimeout(chromeTimer.current); }, []);

  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  if (!ready) return <Stage><Centered>{t("live.preparing")}</Centered></Stage>;
  if (event === false) return <Stage><Centered>{t("live.notFound")}</Centered></Stage>;
  if (photos.length === 0) return (
    <Stage>
      <Centered>
        <div className="serif" style={{ fontSize: "4vw", color: C.bg, marginBottom: 12 }}>{ev(event, "name")}</div>
        <div style={{ color: C.gold, fontSize: "1.4vw", letterSpacing: 4, textTransform: "uppercase" }}>{t("live.waiting")}</div>
      </Centered>
    </Stage>
  );

  const cur = photos[idx];
  const prev = prevIdx != null ? photos[prevIdx] : null;
  const musicSrc = resolveMusic(event);
  const isMoment = event && event.featured_photo_id && cur.id === event.featured_photo_id;
  const curCount = counts[cur.id] || 0;
  const curLiked = liked.has(cur.id);

  return (
    <Stage onMouseMove={wake} onClick={wake}>
      {musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="auto" />}
      {prev && prev.id !== cur.id && (
        <Frame key={"p" + prev.id + idx} src={prev.url} variant={prevIdx % 3} fading />
      )}
      <Frame key={"c" + cur.id + idx} src={cur.url} variant={idx % 3} />

      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(11,20,38,.6) 100%)", pointerEvents: "none" }} />

      {/* Moment of the Service ribbon */}
      {isMoment && (
        <div style={{ position: "absolute", top: "4vh", left: "50%", transform: "translateX(-50%)", background: C.gold, color: C.ink, padding: ".5vw 1.6vw", borderRadius: 999, fontSize: "1.1vw", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
          {t("live.moment")}
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: showChrome ? 1 : 0, transition: "opacity .6s ease" }}>
        <div style={{ position: "absolute", top: "4vh", left: "4vw", display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/halo-logo.png" alt="HALO" style={{ height: "3vw", width: "auto", display: "block" }} />
          <div>
            <div className="serif" style={{ color: C.bg, fontSize: "1.9vw", lineHeight: 1, fontWeight: 700 }}>{ev(event, "name")}</div>
            <div style={{ color: C.gold, fontSize: ".8vw", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>HALO Live</div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "4vh", left: "4vw", right: "4vw", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: C.bg, fontSize: ".95vw", opacity: .85 }}>
            {idx + 1} / {photos.length}{paused ? ` · ${t("live.paused")}` : ""}
          </div>
          <div style={{ display: "flex", gap: 10, pointerEvents: "auto", alignItems: "center" }}>
            <button onClick={likeCurrent} aria-label={t("react.heart")} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,236,228,.12)", color: C.bg, border: `1px solid rgba(242,236,228,.3)`, padding: ".7vw 1.1vw", borderRadius: 999, fontSize: ".9vw", backdropFilter: "blur(6px)" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill={curLiked ? C.gold : "none"} stroke={curLiked ? C.gold : C.bg} strokeWidth="2" style={{ width: "1.1vw", height: "1.1vw" }}>
                <path d="M12 21s-7.5-4.6-10-9.2C.7 9 1.6 5.6 4.6 4.7 6.7 4 8.8 4.9 12 8c3.2-3.1 5.3-4 7.4-3.3 3 .9 3.9 4.3 2.6 7.1C19.5 16.4 12 21 12 21z" />
              </svg>
              {curCount > 0 && <span>{curCount}</span>}
            </button>
{musicSrc && <Ctrl onClick={toggleMusic}>{musicOn ? t("live.musicOff") : t("live.musicOn")}</Ctrl>}
            <Ctrl onClick={() => setPaused((p) => !p)}>{paused ? t("live.play") : t("live.pause")}</Ctrl>
            <Ctrl onClick={toggleFull}>{t("live.fullscreen")}</Ctrl>
          </div>
        </div>

        {!paused && (
          <div key={idx} style={{ position: "absolute", bottom: 0, left: 0, height: 4, background: C.gold, animation: `grow ${HOLD}ms linear` }} />
        )}
      </div>

      <style>{`
        @keyframes grow { from { width: 0 } to { width: 100% } }
        @keyframes kb0 { from { transform: scale(1.04) translate(0,0) } to { transform: scale(1.15) translate(-2%, -1.5%) } }
        @keyframes kb1 { from { transform: scale(1.15) translate(-2%, 1.5%) } to { transform: scale(1.04) translate(0,0) } }
        @keyframes kb2 { from { transform: scale(1.05) translate(1.5%, 1%) } to { transform: scale(1.16) translate(-1.5%, -1.5%) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .kb-img { animation: fadeIn .8s ease !important; }
        }
      `}</style>
    </Stage>
  );
}

function Frame({ src, fading, variant = 0 }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", animation: fading ? "none" : "fadeIn 1s ease", opacity: fading ? 0 : 1, transition: "opacity 1s ease" }}>
      <img className="kb-img" src={src} alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", animation: `kb${variant} 8s ease-out forwards`, willChange: "transform" }} />
    </div>
  );
}

function Stage({ children, ...rest }) {
  return (
    <div {...rest} style={{ position: "fixed", inset: 0, background: C.inkDeep, overflow: "hidden", cursor: "default" }}>
      {children}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", color: C.bg, fontSize: "1.6vw" }}>{children}</div>;
}

function Ctrl({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "rgba(242,236,228,.12)", color: C.bg, border: `1px solid rgba(242,236,228,.3)`, padding: ".7vw 1.2vw", borderRadius: 999, fontSize: ".9vw", backdropFilter: "blur(6px)" }}>
      {children}
    </button>
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
