import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";

// HALO Live — a projector-ready slideshow of kept photos.
// Auto-advances with a slow Ken Burns drift, cross-fades between shots,
// and polls for new uploads so the wall stays live during the service.
export default function SlideshowPage() {
  const { code } = useParams();
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const seen = useRef(new Set());
  const chromeTimer = useRef(null);

  const HOLD = 6500; // ms per photo

  // load event + initial photos
  useEffect(() => {
    (async () => {
      const { data: ev } = await supabase.from("events").select("*").eq("code", code).single();
      setEvent(ev || false);
      if (ev) await refresh(ev.id, true);
      setReady(true);
    })();
  }, [code]);

  const refresh = useCallback(async (eventId, initial = false) => {
    const { data } = await supabase.from("photos").select("*")
      .eq("event_id", eventId).eq("kept", true)
      .order("created_at", { ascending: true });
    const mapped = (data || []).map((p) => ({
      ...p,
      url: p.edited_path ? publicUrl(p.edited_path) : publicUrl(p.storage_path),
    }));
    if (initial) {
      mapped.forEach((p) => seen.current.add(p.id));
      // shuffle once for variety on first load
      setPhotos(shuffle(mapped));
    } else {
      const fresh = mapped.filter((p) => !seen.current.has(p.id));
      if (fresh.length) {
        fresh.forEach((p) => seen.current.add(p.id));
        // insert new photos right after the current one so they surface fast
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
    const t = setInterval(() => refresh(event.id, false), 12000);
    return () => clearInterval(t);
  }, [event, refresh]);

  // advance timer
  useEffect(() => {
    if (paused || photos.length < 2) return;
    const t = setTimeout(() => go(1), HOLD);
    return () => clearTimeout(t);
  }, [idx, paused, photos.length]);

  function go(dir) {
    setPhotos((cur) => {
      if (cur.length === 0) return cur;
      setPrevIdx(idx);
      setIdx((i) => (i + dir + cur.length) % cur.length);
      return cur;
    });
  }

  // keyboard + auto-hide chrome
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === "f") toggleFull();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx]);

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

  if (!ready) return <Stage><Centered>Preparing the gallery…</Centered></Stage>;
  if (event === false) return <Stage><Centered>Event not found.</Centered></Stage>;
  if (photos.length === 0) return (
    <Stage>
      <Centered>
        <div className="serif" style={{ fontSize: "4vw", color: C.bg, marginBottom: 12 }}>{event.name}</div>
        <div style={{ color: C.gold, fontSize: "1.4vw", letterSpacing: 4, textTransform: "uppercase" }}>Waiting for the first moment…</div>
      </Centered>
    </Stage>
  );

  const cur = photos[idx];
  const prev = prevIdx != null ? photos[prevIdx] : null;

  return (
    <Stage onMouseMove={wake} onClick={wake}>
      {/* previous frame fades out under the new one */}
      {prev && prev.id !== cur.id && (
        <Frame key={"p" + prev.id + idx} src={prev.url} variant={prevIdx % 3} fading />
      )}
      <Frame key={"c" + cur.id + idx} src={cur.url} variant={idx % 3} />

      {/* gradient vignette for text legibility */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(28,38,64,.55) 100%)", pointerEvents: "none" }} />

      {/* chrome: title + progress + controls */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: showChrome ? 1 : 0, transition: "opacity .6s ease" }}>
        <div style={{ position: "absolute", top: "4vh", left: "4vw", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", border: `3px solid ${C.gold}` }} />
          <div>
            <div className="serif" style={{ color: C.bg, fontSize: "1.9vw", lineHeight: 1, fontWeight: 700 }}>{event.name}</div>
            <div style={{ color: C.gold, fontSize: ".8vw", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>HALO Live</div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "4vh", left: "4vw", right: "4vw", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: C.bg, fontSize: ".95vw", opacity: .85 }}>
            {idx + 1} / {photos.length}{paused ? " · paused" : ""}
          </div>
          <div style={{ display: "flex", gap: 10, pointerEvents: "auto" }}>
            <Ctrl onClick={() => setPaused((p) => !p)}>{paused ? "Play" : "Pause"}</Ctrl>
            <Ctrl onClick={toggleFull}>Fullscreen</Ctrl>
          </div>
        </div>

        {/* slim progress bar */}
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
    <div {...rest} style={{ position: "fixed", inset: 0, background: "#0d1426", overflow: "hidden", cursor: "default" }}>
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
