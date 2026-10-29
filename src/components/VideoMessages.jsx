import React, { useEffect, useState } from "react";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { useDialogs } from "./Dialogs.jsx";
import { downloadZip, downloadOne } from "../lib/zipDownload.js";
import { fmtSeconds } from "../lib/videoMessage.js";

// Manage > Video messages. Only mounted while the event's video guestbook is
// on (the switch only exists once the event-extras SQL has run, so querying
// photos.kind here is safe). Lists every message (including held and hidden
// ones), plays one in a pop-up, hides / shows / deletes through the same
// server functions the photo grid uses, and downloads them all as one ZIP so
// the host can cut a keepsake reel.
export default function VideoMessages({ event, api, contributors = [], canDelete = true }) {
  const { t, lang } = useI18n();
  const dlg = useDialogs();
  const [rows, setRows] = useState(null); // null = loading
  const [playing, setPlaying] = useState(null);
  const [zipping, setZipping] = useState(null);
  const [busy, setBusy] = useState(null); // id being changed

  const names = Object.fromEntries((contributors || []).map((c) => [c.id, c.name]));
  const nameOf = (m) => { const n = names[m.contributor_id]; return n && n !== "Guest" ? n : t("vgb.guest"); };

  async function load() {
    const { data, error } = await supabase.from("photos").select("*").eq("event_id", event.id).eq("kind", "message")
      .order("created_at", { ascending: true }).limit(1000);
    if (error) { setRows((cur) => cur || []); return; } // keep what we have on a blip
    setRows((data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), video_url: p.video_path ? publicUrl(p.video_path) : null })));
  }
  useEffect(() => {
    load();
    const ch = supabase.channel(`vmsg-${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${event.id}` }, () => load())
      .subscribe();
    const tmr = setInterval(load, 60000);
    return () => { supabase.removeChannel(ch); clearInterval(tmr); };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!playing) return;
    const onKey = (e) => { if (e.key === "Escape") setPlaying(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing]);

  const list = rows || [];
  const fileName = (m, i) => {
    const who = nameOf(m).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "Guest";
    const ext = (String(m.video_path || "").match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1];
    return `HALO_${event.code}_message-${String(i + 1).padStart(2, "0")}_${who}.${ext}`;
  };
  const timeOf = (m) => {
    try { return new Date(m.created_at).toLocaleTimeString(lang === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true }); }
    catch { return ""; }
  };

  async function setStatus(m, status) {
    setBusy(m.id);
    try { await api.fn("moderate-photos", { photoIds: [m.id], status }); setRows((cur) => (cur || []).map((x) => (x.id === m.id ? { ...x, status } : x))); }
    catch { dlg.toast(t("vgb.hostError"), "error"); }
    finally { setBusy(null); }
  }
  async function remove(m) {
    if (!(await dlg.confirm({ title: t("vgb.deleteTitle"), message: t("vgb.deleteMsg"), confirmLabel: t("vgb.delete"), danger: true }))) return;
    setBusy(m.id);
    try { await api.fn("delete-photos", { photoIds: [m.id] }); setRows((cur) => (cur || []).filter((x) => x.id !== m.id)); if (playing && playing.id === m.id) setPlaying(null); }
    catch { dlg.toast(t("vgb.hostError"), "error"); }
    finally { setBusy(null); }
  }
  async function downloadAll() {
    const items = list.filter((m) => m.video_url && m.status !== "hidden");
    if (zipping || !items.length) return;
    setZipping({ done: 0, total: items.length });
    try {
      const files = items.map((m, i) => ({ url: m.video_url, name: fileName(m, i) }));
      const text = items.map((m, i) => `${fileName(m, i)}  ${nameOf(m)}  ${timeOf(m)}  ${fmtSeconds(m.duration)}`).join("\n") + "\n";
      const slug = String(event.name || event.code).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      const { missing } = await downloadZip(files, `HALO_${slug || event.code}_${files.length}-video-messages.zip`, (done, total) => setZipping({ done, total }), [{ name: "messages.txt", text }]);
      if (missing.length) dlg.toast(t("vgb.missing"), "info");
    } catch { dlg.toast(t("vgb.hostError"), "error"); }
    finally { setZipping(null); }
  }

  const pill = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 36, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer" };
  const live = list.filter((m) => m.status !== "hidden").length;

  return (
    <div id="halo-video-messages" data-testid="vgb-host" style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: C.gold, display: "inline-flex" }} aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6.5" width="12.5" height="11" rx="2" /><path d="m15.5 10.5 5-3v9l-5-3" /><circle cx="9.25" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>
        </span>
        <div style={{ fontWeight: 800, color: C.text, fontSize: 15 }}>{t("vgb.title")} ({live})</div>
      </div>
      <p style={{ fontSize: 12, color: C.second, margin: "6px 0 12px", lineHeight: 1.5 }}>{t("vgb.help")}</p>

      {rows && list.length === 0 && <div style={{ fontSize: 13, color: C.second }}>{t("vgb.none")}</div>}

      {list.length > 0 && (
        <>
          <div style={{ display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
            {list.map((m, i) => (
              <div key={m.id} data-testid="vgb-host-row" style={{ display: "flex", gap: 12, alignItems: "center", background: "rgba(255,255,255,.03)", border: `1px solid ${C.line2}`, borderRadius: 12, padding: 8, opacity: m.status === "hidden" ? 0.55 : 1, minWidth: 0 }}>
                <button type="button" onClick={() => setPlaying(m)} aria-label={`${t("vgb.play")}: ${nameOf(m)}`}
                  style={{ position: "relative", flex: "0 0 auto", width: 64, height: 64, padding: 0, border: "none", borderRadius: 10, overflow: "hidden", background: "#000", cursor: "pointer" }}>
                  <img src={m.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(0,0,0,.25)", color: "#fff" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                  </span>
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nameOf(m)}</div>
                  <div style={{ fontSize: 11.5, color: C.second, marginTop: 2 }}>
                    {[fmtSeconds(m.duration), timeOf(m), m.status === "hidden" ? t("vgb.hidden") : m.status === "pending" ? t("vgb.pending") : null].filter(Boolean).join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {m.status === "pending" && <button type="button" disabled={busy === m.id} onClick={() => setStatus(m, "approved")} style={{ ...pill, borderColor: C.gold, color: C.gold }}>{t("vgb.approve")}</button>}
                    <button type="button" disabled={busy === m.id} onClick={() => setStatus(m, m.status === "hidden" ? "approved" : "hidden")} style={pill}>{m.status === "hidden" ? t("vgb.show") : t("vgb.hide")}</button>
                    <button type="button" onClick={() => downloadOne(m.video_url, fileName(m, i)).catch(() => window.open(m.video_url, "_blank", "noopener"))} style={pill}>{t("vgb.download")}</button>
                    {canDelete && <button type="button" disabled={busy === m.id} onClick={() => remove(m)} style={{ ...pill, color: C.pink }}>{t("vgb.delete")}</button>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" data-testid="vgb-download-all" onClick={downloadAll} disabled={!!zipping || live === 0}
            style={{ marginTop: 12, minHeight: 44, background: C.gold, color: C.onInk, border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: zipping || live === 0 ? 0.7 : 1 }}>
            {zipping ? t("vgb.zipping").replace("{done}", zipping.done).replace("{total}", zipping.total) : `${t("vgb.downloadAll")} (${live})`}
          </button>
        </>
      )}

      {playing && (
        <div role="dialog" aria-modal="true" aria-label={nameOf(playing)} onClick={() => setPlaying(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 16 }}>
          <video src={playing.video_url} poster={playing.url} controls autoPlay playsInline onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 12, background: "#000" }} />
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{nameOf(playing)}</div>
          <button type="button" onClick={() => setPlaying(null)} style={{ minHeight: 44, background: C.gold, color: C.onInk, border: "none", padding: "10px 22px", borderRadius: 999, fontWeight: 700, cursor: "pointer" }}>{t("vgb.close")}</button>
        </div>
      )}
    </div>
  );
}
