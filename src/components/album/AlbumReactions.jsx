import React, { useState } from "react";
import { useI18n } from "../../lib/i18n.jsx";

// Heart + thumbs-up on a photo, in the album look (gallery grid and the
// full-screen viewer). Each tap also sends the reaction to the live screen,
// where it floats up as an animated heart / thumbs-up buddy.
//   hearts: { kinds: {photoId: {heart, like}}, liked: Set("id:kind"), onLike(id, kind) }
const HEART = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 4.3 2.4.7-1.3 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" /></svg>;
const THUMB = <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2 10.5A1.5 1.5 0 0 1 3.5 9H6v12H3.5A1.5 1.5 0 0 1 2 19.5v-9zM8 21V9.6l4.3-6.4a1.8 1.8 0 0 1 3.2 1.4L14.7 9h5a2.3 2.3 0 0 1 2.2 2.8l-1.8 7.4A2.3 2.3 0 0 1 17.9 21H8z" /></svg>;

export default function AlbumReactions({ photoId, hearts, variant = "tile" }) {
  const { t } = useI18n();
  const [pop, setPop] = useState(null);
  if (!hearts || !photoId) return null;
  const k = hearts.kinds[photoId] || {};
  const btn = (kind, icon, label) => {
    const on = hearts.liked.has(`${photoId}:${kind}`);
    const n = k[kind] || 0;
    return (
      <button type="button" key={kind} id={variant === "viewer" ? `albv-${kind}` : undefined}
        className={"alb-rx" + (on ? " on" : "") + (pop === kind ? " pop" : "") + ` ${kind}`}
        aria-pressed={on} aria-label={`${label}${n ? ` (${n})` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (!on) { setPop(kind); setTimeout(() => setPop(null), 650); }
          hearts.onLike(photoId, kind);
        }}>
        {icon}{n > 0 && <span>{n}</span>}
      </button>
    );
  };
  return (
    <div className={"alb-rxs " + variant} onClick={(e) => e.stopPropagation()} onTouchEnd={(e) => e.stopPropagation()}>
      {btn("heart", HEART, t("react.heart"))}
      {btn("like", THUMB, t("react.like"))}
    </div>
  );
}

export const REACTIONS_CSS = `
.alb-rxs{display:flex;gap:6px}
.alb-rxs.tile{position:absolute;right:6px;bottom:6px;z-index:2}
.alb-rx{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:34px;min-width:34px;padding:0 9px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.5);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums}
.alb-rx svg{width:16px;height:16px}
.alb-rx.heart.on{color:#ff4d8d;border-color:rgba(255,77,141,.6)}
.alb-rx.like.on{color:#36e3ff;border-color:rgba(54,227,255,.6)}
.alb-rx:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.alb-rx.pop svg{animation:albRxPop .6s cubic-bezier(.3,1.6,.5,1)}
@keyframes albRxPop{0%{transform:scale(1)}35%{transform:scale(1.55)}100%{transform:scale(1)}}
.alb-rxs.viewer{justify-content:center;gap:10px}
.alb-rxs.viewer .alb-rx{min-height:44px;min-width:56px;padding:0 14px;font-size:14px;background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.24)}
.alb-rxs.viewer .alb-rx svg{width:20px;height:20px}
@media (prefers-reduced-motion:reduce){.alb-rx.pop svg{animation:none}}
`;
