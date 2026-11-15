// Super-admin: the HALO music library every host picks from.
// Load the Pixabay starter pack, upload your own tracks, set each track's
// occasion, turn tracks on/off, delete.
import React, { useEffect, useState } from "react";
import { C } from "../lib/score.js";
import { publicUrl } from "../lib/supabase.js";
import { putToR2 } from "../lib/r2upload.js";
import { useI18n } from "../lib/i18n.jsx";
import { MOODS, fmtDuration } from "../lib/music.js";

function TrashIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>;
}

function audioDuration(file) {
  return new Promise((res) => {
    try {
      const a = new Audio(); a.preload = "metadata"; a.src = URL.createObjectURL(file);
      a.onloadedmetadata = () => { res(Math.round(a.duration) || null); URL.revokeObjectURL(a.src); };
      a.onerror = () => res(null);
      setTimeout(() => res(null), 5000);
    } catch { res(null); }
  });
}

export default function MusicLibraryAdmin({ token, api, startOpen = false }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen);
  const [rows, setRows] = useState([]);
  const [starterTotal, setStarterTotal] = useState(0);
  const [importing, setImporting] = useState(null); // { done, total, failed }
  const [upMood, setUpMood] = useState("romantic");
  const [upTitle, setUpTitle] = useState("");
  const [upArtist, setUpArtist] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function call(body) {
    if (api) return api.fn("music-library", body); // signed-in admin account (dashboard)
    const r = await fetch("/.netlify/functions/music-library", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: token, ...body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Failed");
    return j;
  }
  async function load() {
    try { const j = await call({ action: "list" }); setRows(j.rows || []); setStarterTotal(j.starterTotal || 0); if (!(j.rows || []).length) setOpen(true); }
    catch (e) { setMsg(e.message); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function importStarter() {
    setMsg(""); let done = 0; const failed = [];
    setImporting({ done, total: starterTotal, failed: 0 });
    try {
      for (let i = 0; i < 30; i++) {
        const j = await call({ action: "import_starter" });
        done += j.imported; (j.failed || []).forEach((f) => failed.push(f));
        setImporting({ done, total: j.total, failed: failed.length });
        await load();
        if (!j.remaining || (j.imported === 0 && (j.failed || []).length === 0)) break;
      }
      setMsg(failed.length ? t("ml.importSomeFailed").replace("{n}", failed.length) + " " + failed.map((f) => f.title).join(", ") : t("ml.importDone"));
    } catch (e) { setMsg(e.message); } finally { setImporting(null); }
  }
  async function upload(file) {
    if (!file) return;
    setUpBusy(true); setMsg("");
    try {
      const s = await call({ action: "sign", filename: file.name });
      await putToR2(s.uploadUrl, file, s.contentType);
      const duration = await audioDuration(file);
      await call({ action: "add", path: s.path, title: upTitle || file.name.replace(/\.[^.]+$/, ""), artist: upArtist, mood: upMood, duration });
      setUpTitle(""); setUpArtist(""); await load();
      setMsg(t("ml.uploaded"));
    } catch (e) { setMsg(e.message); } finally { setUpBusy(false); }
  }
  async function toggle(x) { try { await call({ action: "toggle", id: x.id, active: !x.active }); await load(); } catch (e) { setMsg(e.message); } }
  async function setMood(x, mood) { try { await call({ action: "update", id: x.id, mood }); await load(); } catch (e) { setMsg(e.message); } }
  async function remove(x) {
    if (!window.confirm(t("ml.confirmDelete").replace("{t}", x.title || ""))) return;
    try { await call({ action: "remove", id: x.id }); await load(); } catch (e) { setMsg(e.message); }
  }

  const imported = rows.filter((r) => r.source === "pixabay").length;
  const field = { minHeight: 38, borderRadius: 10, border: `1px solid ${C.line2}`, background: "rgba(255,255,255,.05)", color: C.text, padding: "0 10px", fontSize: 14, minWidth: 0 };
  const pill = { minHeight: 38, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "transparent", border: "none", padding: 0, color: C.text, cursor: "pointer" }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t("ml.title")} <span style={{ color: C.second, fontWeight: 400 }}>({rows.length})</span></span>
        <span style={{ color: C.second, fontSize: 18 }}>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px", lineHeight: 1.5 }}>{t("ml.help")}</p>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={importStarter} disabled={!!importing || imported >= starterTotal}
              style={{ ...pill, background: C.gold, color: C.ink, border: "none", opacity: importing || imported >= starterTotal ? 0.6 : 1 }}>
              {importing ? t("ml.importing").replace("{d}", importing.done).replace("{t}", importing.total)
                : imported >= starterTotal && starterTotal ? t("ml.starterLoaded") : t("ml.loadStarter").replace("{n}", starterTotal - imported)}
            </button>
            <span style={{ fontSize: 12, color: C.second }}>{t("ml.starterNote")}</span>
          </div>

          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>{t("ml.uploadTitle")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8 }}>
              <input style={field} value={upTitle} onChange={(e) => setUpTitle(e.target.value)} placeholder={t("ml.trackTitle")} maxLength={120} />
              <input style={field} value={upArtist} onChange={(e) => setUpArtist(e.target.value)} placeholder={t("ml.artist")} maxLength={120} />
              <select style={field} value={upMood} onChange={(e) => setUpMood(e.target.value)}>
                {MOODS.map((m) => <option key={m} value={m}>{t("music." + m)}</option>)}
              </select>
              <label style={{ ...pill, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.gold}`, color: C.text, opacity: upBusy ? 0.6 : 1 }}>
                {upBusy ? t("admin.musicUploading") : t("ml.chooseFile")}
                <input type="file" accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*" hidden disabled={upBusy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
              </label>
            </div>
            <p style={{ fontSize: 11, color: C.second, margin: "6px 0 0" }}>{t("ml.uploadHint")}</p>
          </div>

          {msg && <div style={{ fontSize: 12.5, color: C.gold, fontWeight: 700, marginTop: 12 }}>{msg}</div>}

          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: C.second, marginTop: 14 }}>{t("ml.empty")}</p>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
              {MOODS.filter((m) => rows.some((r) => r.mood === m)).concat(rows.some((r) => !MOODS.includes(r.mood)) ? ["other"] : []).map((m) => (
                <div key={m}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>{m === "other" ? t("ml.otherMood") : t("music." + m)}</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {rows.filter((r) => (m === "other" ? !MOODS.includes(r.mood) : r.mood === m)).map((x) => (
                      <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", borderRadius: 12, padding: "8px 10px", border: `1px solid ${x.active ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.07)"}`, opacity: x.active ? 1 : 0.55 }}>
                        <div style={{ minWidth: 140, flex: "1 1 160px" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{x.title || t("music." + x.mood)}</div>
                          <div style={{ fontSize: 11, color: C.second }}>{[x.artist, x.duration ? fmtDuration(x.duration) : null, x.source === "pixabay" ? "Pixabay" : x.source === "upload" ? t("ml.yourUpload") : x.source].filter(Boolean).join(" · ")}</div>
                        </div>
                        <audio controls preload="none" src={publicUrl(x.storage_path)} style={{ height: 34, flex: "1 1 200px", minWidth: 0, maxWidth: "100%" }} />
                        <select value={MOODS.includes(x.mood) ? x.mood : ""} onChange={(e) => setMood(x, e.target.value)} style={{ ...field, minHeight: 34, fontSize: 12 }}>
                          {!MOODS.includes(x.mood) && <option value="">{t("ml.otherMood")}</option>}
                          {MOODS.map((mm) => <option key={mm} value={mm}>{t("music." + mm)}</option>)}
                        </select>
                        <button type="button" onClick={() => toggle(x)} style={{ ...pill, minHeight: 34, fontSize: 11, background: x.active ? C.gold : "transparent", color: x.active ? C.ink : C.second, border: `1px solid ${x.active ? C.gold : C.line2}` }}>
                          {x.active ? t("ml.on") : t("ml.off")}
                        </button>
                        <button type="button" onClick={() => remove(x)} aria-label={t("ml.delete")} style={{ width: 34, height: 34, display: "grid", placeItems: "center", borderRadius: 10, background: "transparent", border: "1px solid rgba(255,138,128,.5)", color: "#ff8a80", cursor: "pointer" }}>
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
