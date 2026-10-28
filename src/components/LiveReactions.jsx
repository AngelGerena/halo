import React from "react";

// HALO live-screen reaction characters. Flat SVG "buddies" with faces that
// pop in with a bounce, blink, wiggle and drift up the screen trailing a
// burst of sparkles. Original artwork; no emoji fonts involved so they look
// identical on every TV, Mac, Chromecast and Fire Stick.
//
// <ReactionBuddy kind="heart" | "like" big />
// Wrap it in a positioned element; it fills its box (use vw units on the TV).

const SPARKS = [0, 60, 120, 180, 240, 300];

function Sparkles({ color, big }) {
  return (
    <g className="rx-sparks" aria-hidden="true">
      {SPARKS.map((deg, i) => (
        <g key={deg} style={{ transform: `rotate(${deg}deg)`, transformOrigin: "50px 50px" }}>
          <path className="rx-spark" style={{ animationDelay: `${i * 0.04}s`, "--sd": big ? "62px" : "48px" }}
            d="M50 6 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6z" fill={color} />
        </g>
      ))}
    </g>
  );
}

function Face({ cx = 50, cy = 52, gap = 11, blush = "#ff6b9a", mouthWidth = 10, eyeColor = "#2a1430" }) {
  return (
    <g>
      <g className="rx-eyes" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <ellipse cx={cx - gap} cy={cy} rx="3.6" ry="5" fill={eyeColor} />
        <ellipse cx={cx + gap} cy={cy} rx="3.6" ry="5" fill={eyeColor} />
        <circle cx={cx - gap + 1.3} cy={cy - 1.8} r="1.3" fill="#fff" />
        <circle cx={cx + gap + 1.3} cy={cy - 1.8} r="1.3" fill="#fff" />
      </g>
      <circle cx={cx - gap - 7} cy={cy + 7} r="4" fill={blush} opacity=".55" />
      <circle cx={cx + gap + 7} cy={cy + 7} r="4" fill={blush} opacity=".55" />
      <path d={`M${cx - mouthWidth / 2} ${cy + 8} q${mouthWidth / 2} 7 ${mouthWidth} 0`} stroke={eyeColor} strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </g>
  );
}

// A heart with a face. Pink body, soft highlight, gold sparkles.
export function HeartBuddy({ big = false, tone = "#ff3d81" }) {
  return (
    <svg viewBox="0 0 100 100" className="rx-sprite" aria-hidden="true">
      <Sparkles color="#ffd27a" big={big} />
      <g className="rx-body">
        <path d="M50 88 C32 76 14 62 12 44 C10 30 20 19 32 19 c8 0 14 5 18 11 c4 -6 10 -11 18 -11 c12 0 22 11 20 25 C86 62 68 76 50 88z" fill={tone} />
        <path d="M24 31 c3 -5 9 -8 14 -7" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" opacity=".55" />
        <Face cy={50} blush="#ffffff" eyeColor="#2a1430" />
      </g>
    </svg>
  );
}

// A thumbs-up with a face on the hand. Gold body, pink sparkles.
export function ThumbBuddy({ big = false, tone = "#ffb86b" }) {
  return (
    <svg viewBox="0 0 100 100" className="rx-sprite" aria-hidden="true">
      <Sparkles color="#ff6b9a" big={big} />
      <g className="rx-body">
        {/* cuff */}
        <rect x="14" y="48" width="16" height="36" rx="6" fill="#e0943f" />
        {/* hand */}
        <path d="M32 50 h34 c6 0 10 4 10 9 c0 3 -1.5 5.5 -4 7 c2.5 1.5 4 4 4 7 c0 3 -1.5 5.5 -4 7 c1.5 1.5 2.5 3.5 2.5 6 c0 5 -4 8 -9 8 H32z" fill={tone} />
        {/* thumb */}
        <path d="M31 58 V48 c0 -6 7 -12 11 -20 c2 -5 1 -12 6 -14 c6 -2 10 3 10 10 c0 6 -3 11 -4 16 L60 58 z" fill={tone} />
        <path d="M44 24 c1 -4 4 -7 7 -7" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity=".6" />
        <Face cx={52} cy={66} gap={9} blush="#ff6b9a" mouthWidth={9} eyeColor="#2a1430" />
      </g>
    </svg>
  );
}

export function ReactionBuddy({ kind = "heart", big = false }) {
  return kind === "like" ? <ThumbBuddy big={big} /> : <HeartBuddy big={big} />;
}

// Shared keyframes. Mount once on the live screen.
export const LIVE_REACTION_CSS = `
  .rx-float { position: absolute; bottom: -10vw; pointer-events: none;
    animation: rxRise var(--dur, 4.6s) cubic-bezier(.25,.6,.3,1) forwards; }
  .rx-float .rx-sprite { width: 100%; height: 100%; display: block; overflow: visible;
    filter: drop-shadow(0 6px 14px rgba(0,0,0,.4)); }
  .rx-float .rx-body { transform-origin: 50px 50px;
    animation: rxPop .7s cubic-bezier(.3,1.6,.4,1) both, rxWiggle 1.1s ease-in-out .7s infinite alternate; }
  .rx-float.rx-big .rx-body { animation: rxPop .9s cubic-bezier(.3,1.7,.4,1) both, rxBounce 1.3s ease-in-out .9s infinite; }
  .rx-float .rx-eyes { animation: rxBlink 2.6s ease-in-out var(--blink, .4s) infinite; }
  .rx-float .rx-spark { transform-origin: 50px 50px; opacity: 0;
    animation: rxSpark .9s ease-out both; }
  .rx-float.rx-big .rx-spark { animation-duration: 1.2s; }
  @keyframes rxRise {
    0%   { opacity: 0; transform: translate(0, 0) }
    8%   { opacity: 1; transform: translate(calc(var(--drift) * .15), -6vh) }
    40%  { transform: translate(calc(var(--drift) * .55), -30vh) }
    70%  { opacity: 1; transform: translate(calc(var(--drift) * .85), -56vh) }
    100% { opacity: 0; transform: translate(var(--drift), -82vh) }
  }
  @keyframes rxPop {
    0%   { transform: scale(0) rotate(-20deg) }
    60%  { transform: scale(1.25) rotate(6deg) }
    80%  { transform: scale(.94) rotate(-3deg) }
    100% { transform: scale(1) rotate(0) }
  }
  @keyframes rxWiggle { from { transform: rotate(-8deg) } to { transform: rotate(8deg) } }
  @keyframes rxBounce {
    0%, 100% { transform: translateY(0) scale(1) }
    35%      { transform: translateY(-6px) scale(1.06, .96) }
    55%      { transform: translateY(0) scale(.97, 1.04) }
  }
  @keyframes rxBlink { 0%, 90%, 100% { transform: scaleY(1) } 94% { transform: scaleY(.08) } }
  @keyframes rxSpark {
    0%   { opacity: 0; transform: translateY(0) scale(0) }
    25%  { opacity: 1; transform: translateY(calc(var(--sd) * -.4)) scale(1.1) }
    100% { opacity: 0; transform: translateY(calc(var(--sd) * -1)) scale(.2) }
  }
`;
