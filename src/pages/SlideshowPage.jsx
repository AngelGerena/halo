import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { fetchReactions, like } from "../lib/reactions.js";
import { useI18n } from "../lib/i18n.jsx";
import QRCode from "qrcode";

// Slideshow music: explicit choice wins; otherwise auto-match by event type.
const CAT_MUSIC = { wedding: "/music/elegant.mp3", quinceanera: "/music/celebration.mp3", church: "/music/worship.mp3", corporate: "/music/corporate.mp3", gala: "/music/elegant.mp3", other: "/music/cinematic.mp3" };
const CAT_MOOD = { wedding: "elegant", quinceanera: "celebration", church: "worship", corporate: "corporate", gala: "elegant", other: "cinematic" };
function resolveMusic(ev) {
  if (!ev) return null;
  const m = ev.music_url;
  if (m === "none") return null;
  if (m) return (m.startsWith("/") || m.startsWith("http")) ? m : publicUrl(m);
  return null; // host-upload / library only — no synth fallback
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
  // One-time "tap to go fullscreen" prompt. Browsers only allow fullscreen
  // from a user gesture, so we can't auto-enter it — but a host setting up a
  // TV shouldn't have to hunt for a tiny button that auto-hides. The first tap
  // anywhere requests fullscreen and dismisses this.
  const [needsTap, setNeedsTap] = useState(() => !document.fullscreenElement);
  const [counts, setCounts] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const seen = useRef(new Set());
  const chromeTimer = useRef(null);
  const eventRef = useRef(null);
  const audioRef = useRef(null);
  const [musicOn, setMusicOn] = useState(false);
  const [libTracks, setLibTracks] = useState([]);

  const HOLD = 6500; // ms per photo

  // While no photos exist yet, the big screen doubles as the invitation:
  // a large QR to the guest page so the room knows what to do.
  const [joinQr, setJoinQr] = useState("");
  useEffect(() => {
    if (!event || !event.code) return;
    const joinUrl = `${window.location.origin}/e/${event.code}`;
    QRCode.toDataURL(joinUrl, { width: 640, margin: 1, color: { dark: "#16294C", light: "#ffffff" } })
      .then(setJoinQr).catch(() => setJoinQr(""));
  }, [event]);

  // load event + initial photos
  useEffect(() => {
    (async () => {
      const { data: evrow } = await supabase.from("events").select("*").eq("code", code).single();
      setEvent(evrow || false);
      eventRef.current = evrow || null;
      const { data: lib } = await supabase.from("music_library").select("*").eq("active", true);
      setLibTracks(lib || []);
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

  // New uploads arrive via Supabase Realtime (event-driven, near-instant) so we
  // don't hammer the database with constant polling. A slow 60s fallback poll
  // stays as a safety net in case the realtime socket drops.
  useEffect(() => {
    if (!event) return;

    // 1) Realtime: fire a refresh only when a photo for THIS event changes.
    const channel = supabase
      .channel(`live-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${event.id}` },
        () => refresh(event.id, false)
      )
      .subscribe();

    // 2) Fallback poll — slow, just in case the socket silently drops.
    const tmr = setInterval(() => refresh(event.id, false), 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(tmr);
    };
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
  // If fullscreen is entered any other way (F key, the Fullscreen button, the
  // browser's own control), retire the prompt too.
  useEffect(() => {
    const onFs = () => { if (document.fullscreenElement) setNeedsTap(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  // First tap anywhere: go fullscreen and retire the prompt.
  function firstTap() {
    if (!needsTap) return;
    setNeedsTap(false);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch?.(() => {});
  }

  if (!ready) return <Stage><Centered>{t("live.preparing")}</Centered></Stage>;
  if (event === false) return <Stage><Centered>{t("live.notFound")}</Centered></Stage>;
  // Shared one-time fullscreen prompt (see needsTap). Big, centered, obvious.
  const tapPrompt = needsTap ? (
    <div onClick={firstTap} role="button" style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(5,8,16,.55)", cursor: "pointer" }}>
      <div style={{ textAlign: "center", padding: "3vw 4vw", borderRadius: 24, background: "rgba(11,20,38,.85)", border: `1px solid rgba(255,184,107,.5)`, backdropFilter: "blur(10px)", maxWidth: "70vw" }}>
        <div style={{ fontSize: "5vw", lineHeight: 1, marginBottom: "1.2vw" }} aria-hidden="true">{"⛶"}</div>
        <div className="serif" style={{ color: C.text, fontSize: "3vw", fontWeight: 700, lineHeight: 1.15 }}>{t("live.tapFull")}</div>
        <div style={{ color: C.gold, fontSize: "1.2vw", letterSpacing: 2, textTransform: "uppercase", marginTop: "1vw" }}>{t("live.tapFullSub")}</div>
      </div>
    </div>
  ) : null;

  if (photos.length === 0) return (
    <Stage>
      {tapPrompt}
      <Centered>
       <div>
        <div className="serif" style={{ fontSize: "4vw", color: C.text, marginBottom: 6 }}>{ev(event, "name")}</div>
        <div style={{ color: C.gold, fontSize: "1.3vw", letterSpacing: 4, textTransform: "uppercase", marginBottom: "2vh" }}>{t("live.waiting")}</div>
        {joinQr && (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "1.6vh", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: "3vh 4vw" }}>
            <img src={joinQr} alt="" style={{ width: "min(30vh, 30vw)", height: "min(30vh, 30vw)", borderRadius: 14, display: "block", background: "#fff" }} />
            <div style={{ color: C.text, fontSize: "2.2vw", fontWeight: 800, lineHeight: 1.15 }}>{t("live.scanTitle")}</div>
            <div style={{ color: C.second, fontSize: "1.25vw", lineHeight: 1.4 }}>{t("live.scanSub")}</div>
          </div>
        )}
       </div>
      </Centered>
    </Stage>
  );

  const cur = photos[idx];
  const prev = prevIdx != null ? photos[prevIdx] : null;
  let musicSrc = null;
  if (event) {
    if (event.music_url) { musicSrc = resolveMusic(event); }
    else {
      const mood = CAT_MOOD[event.category];
      const hit = mood && libTracks.find((x) => x.mood === mood);
      musicSrc = hit ? publicUrl(hit.storage_path) : resolveMusic(event);
    }
  }
  const isMoment = event && event.featured_photo_id && cur.id === event.featured_photo_id;
  const curCount = counts[cur.id] || 0;
  const curLiked = liked.has(cur.id);

  return (
    <Stage onMouseMove={wake} onClick={wake}>
      {tapPrompt}
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
            <div className="serif" style={{ color: C.text, fontSize: "1.9vw", lineHeight: 1, fontWeight: 700 }}>{ev(event, "name")}</div>
            <div style={{ color: C.gold, fontSize: ".8vw", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>HALO Live</div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "4vh", left: "4vw", right: "4vw", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: C.text, fontSize: ".95vw", opacity: .85 }}>
            {idx + 1} / {photos.length}{paused ? ` · ${t("live.paused")}` : ""}
          </div>
          <div style={{ display: "flex", gap: 10, pointerEvents: "auto", alignItems: "center" }}>
            <button onClick={likeCurrent} aria-label={t("react.heart")} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,236,228,.12)", color: C.text, border: `1px solid rgba(242,236,228,.3)`, padding: ".7vw 1.1vw", borderRadius: 999, fontSize: ".9vw", backdropFilter: "blur(6px)" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill={curLiked ? C.gold : "none"} stroke={curLiked ? C.gold : C.white} strokeWidth="2" style={{ width: "1.1vw", height: "1.1vw" }}>
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
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", color: C.text, fontSize: "1.6vw" }}>{children}</div>;
}

function Ctrl({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "rgba(242,236,228,.12)", color: C.text, border: `1px solid rgba(242,236,228,.3)`, padding: ".7vw 1.2vw", borderRadius: 999, fontSize: ".9vw", backdropFilter: "blur(6px)" }}>
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
