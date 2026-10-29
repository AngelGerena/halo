import React, { useCallback, useEffect, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { CloseIcon } from "./Icons.jsx";
import { FILTERS, decodeToCanvas, scaledCopy, renderFilter, canvasToBlob, FILTER_MAX_EDGE } from "../lib/filters.js";

// Fun filters gate for the guest upload buttons.
//
//   const [filterGate, filterNode] = useFilterGate(event);
//   <input onChange={(e) => { filterGate(e.target.files, addFiles); e.target.value = ""; }} />
//   {filterNode}
//
// Switch off (the default): calls fn(fileList) right away, exactly as before.
// Switch on: a single photo opens a full-screen preview with filter thumbnails.
// Send hands fn() one File (the filtered JPEG, tagged with .haloFilter, or the
// untouched original when "Original" is chosen); Cancel sends nothing.
// Videos and multi-photo batches skip the picker and go straight through.
export function useFilterGate(event) {
  const [pending, setPending] = useState(null); // { file, resolve }
  const on = !!(event && event.filters_enabled);

  const gate = useCallback((fileList, fn) => {
    if (!on) return fn(fileList);
    const files = Array.from(fileList || []); // copy now: the input is cleared right after
    const f = files[0];
    if (files.length !== 1 || !f.type || !f.type.startsWith("image/") || f.type === "image/gif") return fn(files);
    new Promise((resolve) => setPending({ file: f, resolve })).then((out) => {
      setPending(null);
      if (out) fn([out]);
    });
  }, [on]);

  const node = pending ? <FilterPicker file={pending.file} onDone={pending.resolve} /> : null;
  return [gate, node];
}

const PREVIEW_EDGE = 1280;
const THUMB_EDGE = 168;

export default function FilterPicker({ file, onDone }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [thumbs, setThumbs] = useState({}); // id -> data url
  const [sel, setSel] = useState("none");
  const [view, setView] = useState({}); // id -> data url (large preview)
  const [busy, setBusy] = useState(false);
  const work = useRef(null); // full upload-size canvas
  const prev = useRef(null); // preview-size canvas
  const doneRef = useRef(false);
  const sendRef = useRef(null);

  const finish = useCallback((out) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(out);
  }, [onDone]);

  // Decode once, then build the thumbnails from a small copy.
  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await decodeToCanvas(file, FILTER_MAX_EDGE);
      if (!alive) return;
      if (!c) { finish(file); return; } // can't read it here: upload as today
      work.current = c;
      prev.current = scaledCopy(c, PREVIEW_EDGE);
      setView({ none: prev.current.toDataURL("image/jpeg", 0.9) });
      setReady(true);
      const small = scaledCopy(c, THUMB_EDGE * 2);
      for (const f of FILTERS) {
        await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
        if (!alive) return;
        try {
          const tc = renderFilter(f.id, small);
          const url = tc.toDataURL("image/jpeg", 0.82);
          setThumbs((m) => ({ ...m, [f.id]: url }));
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [file, finish]);

  // Large preview for the chosen look (made once per look).
  useEffect(() => {
    if (!ready || view[sel] || !prev.current) return;
    const id = setTimeout(() => {
      try {
        const c = renderFilter(sel, prev.current);
        const url = c.toDataURL("image/jpeg", 0.9);
        setView((m) => ({ ...m, [sel]: url }));
      } catch {}
    }, 0);
    return () => clearTimeout(id);
  }, [sel, ready, view]);

  async function send() {
    if (busy) return;
    if (sel === "none" || !work.current) { finish(file); return; }
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint
    try {
      const out = renderFilter(sel, work.current);
      const blob = await canvasToBlob(out);
      out.width = out.height = 0;
      if (!blob) throw new Error("encode");
      const name = (file.name || "photo").replace(/\.[^.]+$/, "") + `-${sel}.jpg`;
      const f = new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
      f.haloFilter = sel;
      finish(f);
    } catch {
      finish(file); // never lose the photo over a filter
    }
  }
  const cancel = useCallback(() => finish(null), [finish]);

  // Esc and the phone's back button close it; lock page scroll while open.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); cancel(); } };
    window.addEventListener("keydown", onKey);
    let pushed = false;
    const onPop = () => { pushed = false; cancel(); };
    try { window.history.pushState({ haloFilter: 1 }, ""); pushed = true; window.addEventListener("popstate", onPop); } catch {}
    const html = document.documentElement, prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      html.style.overflow = prevOverflow;
      if (pushed) { try { window.history.back(); } catch {} }
    };
  }, [cancel]);

  useEffect(() => { if (ready) sendRef.current?.focus(); }, [ready]);
  useEffect(() => () => { // free the big canvases
    if (work.current) { work.current.width = work.current.height = 0; work.current = null; }
    if (prev.current) { prev.current.width = prev.current.height = 0; prev.current = null; }
  }, []);

  const shown = view[sel] || view.none;

  return (
    <div role="dialog" aria-modal="true" aria-label={t("filters.title")} id="filter-picker" style={S.wrap}>
      <div style={S.top}>
        <button type="button" onClick={cancel} style={S.cancel} id="filter-cancel">
          <CloseIcon size={18} /> <span>{t("filters.cancel")}</span>
        </button>
        <div style={S.title}>{t("filters.title")}</div>
        <span style={{ width: 44 }} aria-hidden="true" />
      </div>

      <div style={S.stage}>
        {shown ? (
          <img src={shown} alt="" style={S.img} />
        ) : (
          <div role="status" style={{ color: C.second, fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span className="spin" style={S.spin} />{t("filters.loading")}&hellip;
          </div>
        )}
        {ready && !busy && !view[sel] && (
          <span aria-hidden="true" style={S.mini}><span className="spin" style={S.spin} /></span>
        )}
        {busy && (
          <div role="status" style={S.busy}>
            <span className="spin" style={S.spin} />{t("filters.applying")}&hellip;
          </div>
        )}
      </div>

      <div style={S.bottom}>
        <div role="radiogroup" aria-label={t("filters.choose")} style={S.row} id="filter-row">
          {FILTERS.map((f) => {
            const on = sel === f.id;
            return (
              <button type="button" key={f.id} role="radio" aria-checked={on} data-filter={f.id}
                disabled={!ready || busy} onClick={() => setSel(f.id)} style={S.thumbBtn}>
                <span style={{ ...S.thumb, borderColor: on ? C.gold : "transparent" }}>
                  {thumbs[f.id] ? <img src={thumbs[f.id]} alt="" style={S.thumbImg} /> : <span style={S.thumbPh} />}
                </span>
                <span style={{ ...S.thumbLbl, color: on ? C.gold : C.second, fontWeight: on ? 800 : 600 }}>{t(f.label)}</span>
              </button>
            );
          })}
        </div>
        <button type="button" ref={sendRef} id="filter-send" onClick={send} disabled={!ready || busy}
          style={{ ...S.send, opacity: !ready || busy ? 0.6 : 1 }}>
          {t("filters.send")}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

const S = {
  wrap: { position: "fixed", inset: 0, zIndex: 1000, background: C.inkDeep, color: C.text, display: "flex", flexDirection: "column", overflow: "hidden",
    paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" },
  top: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", flexShrink: 0 },
  cancel: { minHeight: 44, minWidth: 44, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", background: "none", border: "none", color: C.text, fontSize: 15, fontWeight: 600, cursor: "pointer" },
  title: { fontSize: 15, fontWeight: 800, letterSpacing: ".01em", textAlign: "center", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  stage: { flex: 1, minHeight: 0, position: "relative", display: "grid", placeItems: "center", padding: "4px 12px" },
  img: { maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,.45)", display: "block" },
  busy: { position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", display: "flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,.6)", color: "#fff", padding: "12px 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" },
  mini: { position: "absolute", right: 22, top: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,.55)", color: "#fff", display: "grid", placeItems: "center" },
  spin: { width: 16, height: 16, borderRadius: "50%", border: "2px solid currentColor", borderTopColor: "transparent", display: "inline-block", flexShrink: 0 },
  bottom: { flexShrink: 0, padding: "8px 0 12px" },
  row: { display: "flex", gap: 10, overflowX: "auto", overflowY: "hidden", padding: "4px 14px 10px", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", maxWidth: "100%", boxSizing: "border-box" },
  thumbBtn: { flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 68, minHeight: 44 },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden", border: "2px solid transparent", padding: 2, boxSizing: "border-box", display: "block" },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, display: "block" },
  thumbPh: { width: "100%", height: "100%", borderRadius: 8, display: "block", background: "rgba(255,255,255,.08)" },
  thumbLbl: { fontSize: 11.5, whiteSpace: "nowrap" },
  send: { margin: "4px 14px 0", width: "calc(100% - 28px)", minHeight: 52, borderRadius: 999, border: "none", background: C.gold, color: C.ink, fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" },
};
