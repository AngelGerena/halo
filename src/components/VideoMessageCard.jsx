import React, { useEffect, useRef } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { MESSAGE_SECONDS } from "../lib/videoMessage.js";

// Live wall: one guest video message, full screen, between photos.
// Sound stays off (the wall's music may be playing). Plays once, at most
// MESSAGE_SECONDS, then calls onDone. If the video can't play, it gives up
// quickly and the wall carries on.
export default function VideoMessageCard({ msg, name, category, onDone }) {
  const { t } = useI18n();
  const vRef = useRef(null);
  const doneRef = useRef(false);
  const finish = (delay = 700) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setTimeout(() => onDone && onDone(), delay);
  };

  useEffect(() => {
    doneRef.current = false;
    const len = Math.min(Number(msg.duration) || MESSAGE_SECONDS, MESSAGE_SECONDS);
    const cap = setTimeout(() => finish(0), (len + 4) * 1000); // safety net
    const v = vRef.current;
    if (v) { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    return () => clearTimeout(cap);
  }, [msg.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = name && name !== "Guest" ? `${t("vgb.wallFrom")} ${name}` : t("vgb.wallAnon");
  return (
    <div data-testid="vgb-wall-card" style={{ position: "absolute", inset: 0, zIndex: 6, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6vh", padding: "4vh 4vw", background: "radial-gradient(ellipse at center, rgba(10,4,16,.78), rgba(10,4,16,.95))", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", animation: "fadeIn .9s ease", pointerEvents: "none" }}>
      <div style={{ color: C.gold, fontSize: "1.1vw", fontWeight: 800, letterSpacing: ".35em", textTransform: "uppercase", textAlign: "center" }}>
        {category === "wedding" ? t("vgb.wallCouple") : t("vgb.wallHosts")}
      </div>
      <video ref={vRef} src={msg.video_url} poster={msg.url} muted autoPlay playsInline preload="auto"
        onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= MESSAGE_SECONDS) { e.currentTarget.pause(); finish(); } }}
        onEnded={() => finish()} onError={() => finish(0)}
        style={{ maxWidth: "80vw", maxHeight: "70vh", minHeight: 0, borderRadius: "1.4vw", background: "#000", boxShadow: "0 2vw 6vw rgba(0,0,0,.55)", border: `2px solid ${C.gold}`, objectFit: "contain" }} />
      <div className="serif" style={{ color: "#fff", fontSize: "2.2vw", fontWeight: 600, fontStyle: "italic", textAlign: "center", textShadow: "0 2px 18px rgba(0,0,0,.45)" }}>{who}</div>
    </div>
  );
}
