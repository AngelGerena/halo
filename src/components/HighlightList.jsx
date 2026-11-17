// Highlight videos saved to an event: play, download, delete.
// Used in the host dashboard (owner + co-hosts) and the super-admin page.
import React, { useState } from "react";
import { C } from "../lib/score.js";
import { publicUrl } from "../lib/supabase.js";
import { useI18n } from "../lib/i18n.jsx";
import { downloadOne } from "../lib/zipDownload.js";

function TrashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>;
}
function NoteIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>;
}
function DownIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
}

// onDelete(id) -> Promise; confirm(message) -> Promise<boolean>
export default function HighlightList({ event, highlights, onDelete, confirm, onAddMusic = null }) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState("");
  const [adding, setAdding] = useState("");
  const list = Array.isArray(highlights) ? highlights : [];
  if (!list.length) return null;

  async function del(h) {
    const ok = await confirm(t("hls.confirm"));
    if (!ok) return;
    setBusy(h.id);
    try { await onDelete(h.id); } finally { setBusy(""); }
  }
  async function dl(h) {
    setBusy("dl-" + h.id);
    const ext = h.type === "video/webm" ? "webm" : "mp4";
    try { await downloadOne(publicUrl(h.path), `HALO_${event.code}_highlight_${h.id}.${ext}`); }
    catch { window.open(publicUrl(h.path), "_blank", "noopener"); }
    finally { setBusy(""); }
  }
  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 38, padding: "0 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "transparent", color: C.text, border: `1px solid ${C.line2}` };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{t("hls.title")} <span style={{ color: C.second, fontWeight: 600 }}>({list.length})</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 12, marginTop: 10 }}>
        {list.map((h) => (
          <div key={h.id} style={{ border: `1px solid ${C.line2}`, borderRadius: 14, padding: 10, background: "rgba(255,255,255,.03)", minWidth: 0, opacity: busy === h.id ? 0.5 : 1 }}>
            <video src={publicUrl(h.path)} controls playsInline preload="metadata"
              style={{ width: "100%", aspectRatio: h.vertical ? "9 / 16" : "16 / 9", maxHeight: 300, objectFit: "contain", borderRadius: 10, background: "#000", display: "block" }} />
            <div style={{ fontSize: 12, color: C.text, fontWeight: 700, marginTop: 8 }}>
              {new Date(h.created_at).toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short", day: "numeric" })}
              {" · "}{new Date(h.created_at).toLocaleTimeString(lang === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
              {h.seconds ? ` · ${h.seconds}s` : ""}
            </div>
            {h.music && <div style={{ fontSize: 11, color: C.second, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.music}</div>}
            {h.audio === "pending" && <div style={{ fontSize: 11, color: C.gold, marginTop: 2 }}>{t("hls.addingMusic")}</div>}
            {h.audio === "failed" && <div style={{ fontSize: 11, color: "#ffcc80", marginTop: 2 }}>{t("hls.musicFailed")}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <button type="button" style={btn} onClick={() => dl(h)} disabled={!!busy}><DownIcon />{busy === "dl-" + h.id ? t("hls.downloading") : t("hls.download")}</button>
              {onAddMusic && h.music && h.audio !== "done" && h.audio !== "none" && (
                <button type="button" id={`hl-music-${h.id}`} style={{ ...btn, color: C.gold, borderColor: C.gold }} disabled={!!busy || adding === h.id}
                  onClick={async () => { setAdding(h.id); try { await onAddMusic(h.id); } finally { setAdding(""); } }}>
                  <NoteIcon />{adding === h.id ? t("hls.addingMusic") : t("hls.addMusic")}
                </button>
              )}
              <button type="button" style={{ ...btn, color: "#ff8a80", borderColor: "rgba(255,138,128,.5)" }} onClick={() => del(h)} disabled={!!busy}><TrashIcon />{t("hls.delete")}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
