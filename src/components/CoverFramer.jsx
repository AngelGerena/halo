import React, { useRef } from "react";

// Cover framing editor: drag the photo to move it, slider to zoom.
// fx / fy are the focal point (0..1) used as object-position; zoom scales
// the photo up around that point so even a wide photo can be moved up/down
// inside the wide guest header. Same math as coverStyle() so the preview
// matches what guests see.

export function coverStyle(fx = 0.5, fy = 0.5, zoom = 1) {
  const x = Math.round((fx ?? 0.5) * 100), y = Math.round((fy ?? 0.5) * 100);
  const z = Math.max(1, Math.min(3, Number(zoom) || 1));
  return {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
    objectPosition: `${x}% ${y}%`,
    transform: z > 1 ? `scale(${z})` : undefined,
    transformOrigin: `${x}% ${y}%`,
  };
}

export default function CoverFramer({ src, fx, fy, zoom, onChange, gold, labels }) {
  const box = useRef(null);
  const drag = useRef(null);

  function down(e) {
    const r = box.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, fx, fy, w: r.width, h: r.height };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    // Dragging right shows more of the left side, like moving a photo in a frame.
    const k = 1.6 / Math.max(1, zoom);
    const nx = Math.min(1, Math.max(0, d.fx - ((e.clientX - d.x) / d.w) * k));
    const ny = Math.min(1, Math.max(0, d.fy - ((e.clientY - d.y) / d.h) * k));
    onChange({ fx: nx, fy: ny, zoom });
  }
  function up() { drag.current = null; }
  function nudge(dx, dy) {
    onChange({ fx: Math.min(1, Math.max(0, fx + dx)), fy: Math.min(1, Math.max(0, fy + dy)), zoom });
  }

  return (
    <div>
      <div ref={box}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        tabIndex={0} role="application" aria-label={labels.drag}
        onKeyDown={(e) => {
          const s = 0.04;
          if (e.key === "ArrowLeft") { e.preventDefault(); nudge(-s, 0); }
          if (e.key === "ArrowRight") { e.preventDefault(); nudge(s, 0); }
          if (e.key === "ArrowUp") { e.preventDefault(); nudge(0, -s); }
          if (e.key === "ArrowDown") { e.preventDefault(); nudge(0, s); }
        }}
        style={{ position: "relative", width: "100%", aspectRatio: "1.95 / 1", borderRadius: 14, overflow: "hidden", background: "#111",
          cursor: drag.current ? "grabbing" : "grab", touchAction: "none", userSelect: "none", outlineOffset: 2 }}>
        <img src={src} alt="" draggable={false} style={{ ...coverStyle(fx, fy, zoom), pointerEvents: "none" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 999, pointerEvents: "none" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
          {labels.dragShort}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
        <span style={{ fontSize: 11.5, color: "inherit", opacity: 0.8, minWidth: 34 }}>{labels.zoom}</span>
        <input type="range" min="100" max="300" value={Math.round((zoom || 1) * 100)}
          onChange={(e) => onChange({ fx, fy, zoom: Number(e.target.value) / 100 })}
          aria-label={labels.zoom} style={{ flex: 1, accentColor: gold }} />
      </div>
    </div>
  );
}
