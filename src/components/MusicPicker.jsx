// Pick the music for an event's highlight video and live slideshow:
// HALO's library (by occasion, with a play button to preview each track),
// "Auto" (matches the event type), no music, or the host's own MP3/WAV.
//
// Props:
//   event          the event row (category, id)
//   tracks         active music_library rows
//   value          event.music_url: "" = Auto, "none" = no music, else a path/URL
//   onChange(v)    persist a new value (async); rights = true when it's an upload
//   api            for the signed upload of the host's own track
import React, { useEffect, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { publicUrl } from "../lib/supabase.js";
import { putToR2 } from "../lib/r2upload.js";
import { useI18n } from "../lib/i18n.jsx";
import { MOODS, autoTrack, fmtDuration } from "../lib/music.js";

const MAX_MB = 30;

function PlayIcon({ playing }) {
  return playing ? (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ display: "block" }}><path d="M8 5v14l11-7L8 5Z" fill="currentColor" /></svg>
  );
}
function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
}
function NoteIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
}

function Row({ style, onClick, children }) {
  return (
    <div role="button" tabIndex={0} style={style} onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
      {children}
    </div>
  );
}

export function trackLabel(value, tracks, event, t) {
  if (value === "none") return t("mp.none");
  const lib = (tracks || []).find((x) => x.storage_path === value);
  if (lib) return lib.title || t("music." + lib.mood);
  if (value) return t("mp.yourTrack");
  const a = autoTrack(event, tracks);
  return a ? `${t("mp.auto")}: ${a.title || t("music." + a.mood)}` : t("mp.none");
}

export default function MusicPicker({ event, tracks = [], value = "", onChange, api, startOpen = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen);
  const [mood, setMood] = useState("all");
  const [playing, setPlaying] = useState(null); // key of the previewing row
  const [saving, setSaving] = useState(false);
  const [rightsOk, setRightsOk] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [err, setErr] = useState("");
  const audio = useRef(null);

  useEffect(() => () => { if (audio.current) { audio.current.pause(); audio.current = null; } }, []);

  function stop() { if (audio.current) audio.current.pause(); setPlaying(null); }
  function preview(key, src) {
    if (playing === key) { stop(); return; }
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    a.pause(); a.src = src; a.currentTime = 0;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  }
  async function choose(v) {
    if (saving) return;
    setSaving(true); setErr("");
    try { await onChange(v, {}); } catch (e) { setErr(e.message || String(e)); } finally { setSaving(false); }
  }
  async function upload(file) {
    if (!file) return;
    setErr("");
    if (!/\.(mp3|wav|m4a|aac|ogg)$/i.test(file.name)) { setErr(t("mp.badType")); return; }
    if (file.size > MAX_MB * 1024 * 1024) { setErr(t("mp.tooBig").replace("{n}", MAX_MB)); return; }
    setUpBusy(true);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", {
        kind: "music", eventId: event.id, filename: file.name, contentType: file.type || "audio/mpeg",
      });
      await putToR2(uploadUrl, file, contentType);
      await onChange(path, { rights: true, filename: file.name });
    } catch (e) { setErr(e.message || String(e)); } finally { setUpBusy(false); }
  }

  const auto = autoTrack(event, tracks);
  const isLib = tracks.some((x) => x.storage_path === value);
  const isCustom = !!value && value !== "none" && !isLib;
  const shown = tracks.filter((x) => mood === "all" || x.mood === mood);
  const moodsWithTracks = MOODS.filter((m) => tracks.some((x) => x.mood === m));

  const rowStyle = (sel) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 12, minWidth: 0,
    border: `1px solid ${sel ? C.gold : C.line2}`, background: sel ? "color-mix(in srgb, var(--gold) 12%, transparent)" : "rgba(255,255,255,.03)",
    cursor: saving ? "wait" : "pointer", textAlign: "left", width: "100%", color: C.text,
  });
  const playBtn = (key, src) => (
    <span role="button" tabIndex={0} aria-label={playing === key ? t("mp.pause") : t("mp.play")}
      onClick={(e) => { e.stopPropagation(); preview(key, src); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); preview(key, src); } }}
      style={{ width: 34, height: 34, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: playing === key ? C.gold : "rgba(255,255,255,.08)", color: playing === key ? C.ink : C.text, border: `1px solid ${C.line2}` }}>
      <PlayIcon playing={playing === key} />
    </span>
  );
  const chip = (on) => ({ minHeight: 34, padding: "0 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
    border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text });

  return (
    <div style={{ marginTop: 12, border: `1px solid ${C.line2}`, borderRadius: 14, padding: 12, minWidth: 0 }}>
      <button type="button" onClick={() => { setOpen((v) => !v); if (open) stop(); }}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none", padding: 0, color: C.text, cursor: "pointer", textAlign: "left" }}>
        <span style={{ color: C.gold }}><NoteIcon /></span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.second }}>{t("mp.title")}</span>
          <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{trackLabel(value, tracks, event, t)}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, flexShrink: 0 }}>{open ? t("mp.done") : t("mp.change")}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }} role="group" aria-label={t("mp.occasion")}>
            <button type="button" style={chip(mood === "all")} onClick={() => setMood("all")}>{t("mp.all")}</button>
            {moodsWithTracks.map((m) => <button type="button" key={m} style={chip(mood === m)} onClick={() => setMood(m)}>{t("music." + m)}</button>)}
          </div>

          <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 360, overflowY: "auto", paddingRight: 2 }}>
            <Row style={rowStyle(value === "")} onClick={() => choose("")}>
              {auto ? playBtn("auto", publicUrl(auto.storage_path)) : <span style={{ width: 34 }} />}
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{t("mp.auto")}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auto ? `${auto.title} · ${t("mp.autoHint")}` : t("mp.autoEmpty")}</span>
              </span>
              {value === "" && <span style={{ color: C.gold }}><CheckIcon /></span>}
            </Row>

            {isCustom && (
              <Row style={rowStyle(true)} onClick={() => {}}>
                {playBtn("custom", value.startsWith("http") || value.startsWith("/") ? value : publicUrl(value))}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 700 }}>{t("mp.yourTrack")}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: C.second }}>{t("mp.yourTrackHint")}</span>
                </span>
                <span style={{ color: C.gold }}><CheckIcon /></span>
              </Row>
            )}

            {shown.map((x) => {
              const sel = value === x.storage_path;
              return (
                <Row key={x.id} style={rowStyle(sel)} onClick={() => choose(x.storage_path)}>
                  {playBtn(x.id, publicUrl(x.storage_path))}
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title || t("music." + x.mood)}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: C.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[t("music." + x.mood), x.duration ? fmtDuration(x.duration) : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {sel && <span style={{ color: C.gold }}><CheckIcon /></span>}
                </Row>
              );
            })}

            <Row style={rowStyle(value === "none")} onClick={() => choose("none")}>
              <span style={{ width: 34 }} />
              <span style={{ minWidth: 0, flex: 1, fontSize: 13.5, fontWeight: 700 }}>{t("mp.none")}</span>
              {value === "none" && <span style={{ color: C.gold }}><CheckIcon /></span>}
            </Row>
          </div>

          {api && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line2}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("mp.uploadTitle")}</div>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={rightsOk} onChange={(e) => setRightsOk(e.target.checked)} style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--gold)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.second, lineHeight: 1.45 }}>{t("admin.musicRights")}</span>
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, minHeight: 40, padding: "0 16px", borderRadius: 999, fontSize: 13, fontWeight: 700,
                border: `1px solid ${rightsOk ? C.gold : C.line2}`, color: rightsOk ? C.text : C.second, cursor: rightsOk && !upBusy ? "pointer" : "not-allowed", opacity: upBusy ? 0.6 : 1 }}>
                {upBusy ? t("admin.musicUploading") : t("mp.uploadBtn")}
                <input type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" hidden disabled={!rightsOk || upBusy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
              </label>
              <p style={{ fontSize: 11, color: C.second, margin: "6px 0 0" }}>{t("mp.uploadHint").replace("{n}", MAX_MB)}</p>
            </div>
          )}
          {err && <div style={{ color: "#ff8a80", fontSize: 12.5, marginTop: 8 }}>{err}</div>}
          {saving && <div style={{ color: C.second, fontSize: 12, marginTop: 8 }}>{t("frame.saving")}</div>}
        </div>
      )}
    </div>
  );
}
