import React, { useState } from "react";
import { C } from "../lib/score.js";
import { publicUrl } from "../lib/supabase.js";
import { useI18n } from "../lib/i18n.jsx";

// Sponsor branding. The logo is events.frame_partner_path (the same logo the
// Sponsor photo frame uses); the name is events.sponsor_name. With no logo
// these render nothing, so pages look exactly as before.
function sponsorOf(event) {
  const url = event && event.frame_partner_path ? publicUrl(event.frame_partner_path) : null;
  if (!url) return null;
  return { url, name: String(event.sponsor_name || "").trim() };
}

// Guest page: a small "Presented by" line with the logo.
export function SponsorLine({ event, compact }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const s = sponsorOf(event);
  if (!s || broken) return null;
  return (
    <div data-testid="sponsor-line" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
      margin: compact ? "-6px 0 14px" : "14px 0 0", color: C.second, fontSize: 11.5, letterSpacing: ".04em", textAlign: "center" }}>
      <span style={{ textTransform: "uppercase", fontWeight: 700 }}>{t("sponsor.presentedBy")}</span>
      <img src={s.url} alt={s.name || t("sponsor.title")} onError={() => setBroken(true)}
        style={{ height: 26, maxWidth: 120, width: "auto", objectFit: "contain", display: "block" }} />
      {s.name && <span style={{ color: C.text, fontWeight: 600, overflowWrap: "anywhere" }}>{s.name}</span>}
    </div>
  );
}

// Live wall: a quiet badge tucked under the brand corner (top-left). The
// other corners are taken: hearts top-right, stats bottom-left, video
// bottom-right. Fades with the rest of the corners while controls show.
export function SponsorWallBadge({ event, hidden }) {
  const { t } = useI18n();
  const [broken, setBroken] = useState(false);
  const s = sponsorOf(event);
  if (!s || broken) return null;
  return (
    <div data-testid="sponsor-badge" style={{ position: "absolute", left: "2.2vw", top: "calc(2.4vw + max(3.2vw, 30px) + 1.4vw)", display: "flex", alignItems: "center", gap: ".7vw",
      background: "rgba(10,4,16,.5)", color: "#fff", padding: ".45vw .9vw", borderRadius: 12, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
      pointerEvents: "none", opacity: hidden ? 0 : 1, transition: "opacity .6s ease", maxWidth: "30vw" }}>
      <img src={s.url} alt={s.name || t("sponsor.title")} onError={() => setBroken(true)}
        style={{ height: "max(2.4vw, 22px)", maxWidth: "12vw", width: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 1px 4px rgba(0,0,0,.4))" }} />
      {s.name && (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "max(.55vw, 8px)", letterSpacing: ".14em", textTransform: "uppercase", color: C.gold, fontWeight: 700 }}>{t("sponsor.presentedBy")}</div>
          <div style={{ fontSize: "max(.95vw, 11px)", fontWeight: 700, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
        </div>
      )}
    </div>
  );
}
