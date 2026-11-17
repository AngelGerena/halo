import React, { useEffect, useRef, useState } from "react";
import { smallThumb } from "../lib/smallThumbs.js";

// An <img> that shows a small, cheap thumbnail of src, made only once the
// tile scrolls near the screen (see lib/smallThumbs.js).
export default function SmallThumb({ src, style }) {
  const ref = useRef(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    const el = ref.current;
    if (!el) return undefined;
    const go = () => smallThumb(src).then((u) => { if (alive) setUrl(u); });
    if (typeof IntersectionObserver === "undefined") { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [src]);
  return url
    ? <img ref={ref} src={url} alt="" draggable="false" style={style} />
    : <span ref={ref} aria-hidden="true" style={{ ...style, display: "block", background: "rgba(255,255,255,.06)" }} />;
}
