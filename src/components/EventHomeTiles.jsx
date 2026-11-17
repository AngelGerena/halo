// Phone layout for the host's event screen: a short status card and six big
// tiles. Each tile opens one group of the tools (the same sections as the
// long desktop page), with a back button to return here.
import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

const I = {
  share: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM18 14h2v2M14 18h2v2" />,
  photos: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>,
  tv: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
  video: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9l5 3-5 3z" fill="currentColor" /></>,
  guests: <><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" /></>,
};
const COLOR = { share: "#fff", photos: C.pink || "#ff2d9b", tv: "#36e3ff", video: C.gold, guests: C.pink || "#ff2d9b", settings: C.second };

export const PAGES = ["share", "photos", "tv", "video", "guests", "settings"];

// hints: { share, photos, tv, video, guests, settings } -> one short line each
// badges: { photos, guests } -> number shown on the tile when something waits
export default function EventHomeTiles({ title, sub, coverUrl, coverPos, live, hints, badges = {}, onOpen }) {
  const { t } = useI18n();
  return (
    <div style={{ marginTop: 12 }}>
      <style>{`
        .eht-hero{position:relative;height:150px;border-radius:16px;overflow:hidden;background:${C.card};border:1px solid rgba(255,255,255,.1)}
        .eht-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
        .eht-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,rgba(10,4,16,.92) 8%,rgba(10,4,16,.15) 70%)}
        .eht-hero .in{position:absolute;left:14px;right:14px;bottom:12px;z-index:1}
        .eht-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
        .eht-tile{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:14px;min-height:112px;padding:14px;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:${C.card};color:${C.text};text-align:left;cursor:pointer;font:inherit}
        .eht-tile:focus-visible{outline:3px solid ${C.gold};outline-offset:2px}
        .eht-tile.hot{background:linear-gradient(160deg,#ff2d9b,#b0126a);border-color:transparent}
        .eht-tile svg{width:26px;height:26px}
        .eht-tile b{display:block;font-size:15px;line-height:1.2}
        .eht-tile small{display:block;font-size:12px;color:${C.second};margin-top:3px;line-height:1.3}
        .eht-tile.hot small{color:rgba(255,255,255,.88)}
        .eht-badge{position:absolute;top:10px;right:10px;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:${C.gold};color:#1a0d00;font-size:12px;font-weight:800;display:grid;place-items:center}
      `}</style>
      <div className="eht-hero">
        {coverUrl && <img src={coverUrl} alt="" style={{ objectPosition: coverPos || "center" }} />}
        <div className="in">
          {live != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: live ? "#4ade80" : C.second }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: live ? "#4ade80" : C.second }} />
              {live ? t("tiles.live") : t("tiles.quiet")}
            </span>
          )}
          <h2 className="serif" style={{ fontSize: 24, color: "#fff", margin: "4px 0 2px", lineHeight: 1.1, overflowWrap: "anywhere" }}>{title}</h2>
          {sub && <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.85)" }}>{sub}</div>}
        </div>
      </div>
      <div className="eht-grid" role="list">
        {PAGES.map((p) => (
          <button key={p} type="button" role="listitem" id={`tile-${p}`} className={"eht-tile" + (p === "share" ? " hot" : "")} onClick={() => onOpen(p)}>
            {badges[p] > 0 && <span className="eht-badge" aria-hidden="true">{badges[p] > 99 ? "99+" : badges[p]}</span>}
            <svg viewBox="0 0 24 24" fill="none" stroke={COLOR[p]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[p]}</svg>
            <span>
              <b>{t(`tiles.${p}`)}</b>
              {hints[p] && <small>{hints[p]}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
