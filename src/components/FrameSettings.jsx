import React, { useEffect, useMemo, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { publicUrl } from "../lib/supabase.js";
import { putToR2 } from "../lib/r2upload.js";
import { renderFramed, FRAME_STYLES } from "../lib/frames.js";
import { useI18n } from "../lib/i18n.jsx";

const SAMPLE = "/landing/images/moments/couple-portrait.webp";

// Host setting: one frame for every photo guests save or share. Off ("none")
// by default, so events that never touch this keep working exactly as before.
export default function FrameSettings({ event, api, updateEvent, photos, onError }) {
  const { t } = useI18n();
  const [style, setStyle] = useState(event.frame_style || "");
  const [logo, setLogo] = useState(event.frame_logo || "fm");
  const [title, setTitle] = useState(event.frame_title || "");
  const [partner, setPartner] = useState(event.frame_partner_path || "");
  const [saved, setSaved] = useState("");     // "" | "saving" | "saved" | "error"
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const titleTimer = useRef(null);

  // Preview on a real photo from this event when there is one.
  const sample = useMemo(() => {
    const p = (photos || []).find((x) => x.kept && x.status === "approved" && !x.video_url);
    return p ? (p.edited_url || p.url) : SAMPLE;
  }, [photos]);

  const cfg = style ? {
    style, logo,
    title: (title || event.name || "").trim(),
    date: (event.event_date || "").trim(),
    partnerUrl: partner ? publicUrl(partner) : null,
  } : null;
  const cfgKey = JSON.stringify(cfg);

  useEffect(() => {
    if (!cfg) { setPreview(null); return; }
    let alive = true, url = null;
    setPreview(null);
    // If the event photo can't be drawn, fall back to the built-in sample so
    // the host always sees the frame instead of "Preparing..." forever.
    renderFramed(sample, cfg)
      .catch(() => (sample !== SAMPLE ? renderFramed(SAMPLE, cfg) : Promise.reject(new Error("preview"))))
      .then((b) => { if (!alive) return; url = URL.createObjectURL(b); setPreview(url); })
      .catch(() => { if (alive) setPreview("failed"); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [cfgKey, sample]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(patch) {
    setSaved("saving");
    try { await updateEvent(patch); setSaved("saved"); setTimeout(() => setSaved((s) => (s === "saved" ? "" : s)), 2200); }
    catch (e) { setSaved("error"); onError && onError(e); }
  }
  function pickStyle(v) { setStyle(v); save({ frame_style: v || null }); }
  function pickLogo(v) { setLogo(v); save({ frame_logo: v }); }
  function editTitle(v) {
    setTitle(v);
    clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => save({ frame_title: v.trim() || null }), 800);
  }
  useEffect(() => () => clearTimeout(titleTimer.current), []);

  async function uploadPartner(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", {
        kind: "cover", eventId: event.id, filename: file.name, contentType: file.type || "image/png",
      });
      await putToR2(uploadUrl, file, contentType);
      setPartner(path);
      await save({ frame_partner_path: path });
    } catch (e) { onError && onError(e); } finally { setBusy(false); }
  }

  const chip = (on) => ({
    minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text,
  });

  return (
    <div id="set-frame" style={{ marginBottom: 18, borderBottom: `1px solid ${C.line}`, padding: "8px 8px 16px", marginLeft: -8, marginRight: -8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("frame.title")}</div>
        {saved && (
          <span role="status" style={{ fontSize: 11, fontWeight: 700, color: saved === "error" ? "#ff8a80" : C.gold }}>
            {saved === "saving" ? t("frame.saving") : saved === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px", lineHeight: 1.5 }}>{t("frame.help")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={t("frame.title")}>
        <button type="button" id="frame-none" onClick={() => pickStyle("")} aria-pressed={!style} style={chip(!style)}>{t("frame.none")}</button>
        {FRAME_STYLES.map((s) => (
          <button type="button" key={s} id={`frame-${s}`} onClick={() => pickStyle(s)} aria-pressed={style === s} style={chip(style === s)}>{t(`frame.style.${s}`)}</button>
        ))}
      </div>

      {style && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginTop: 14 }}>
          <div style={{ width: 220, maxWidth: "100%", flexShrink: 0 }}>
            <div style={{ width: "100%", aspectRatio: "4 / 5", borderRadius: 10, overflow: "hidden", background: C.panel, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center" }}>
              {preview && preview !== "failed" ? <img src={preview} alt={t("frame.previewAlt")} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                : <span style={{ fontSize: 11, color: C.second, padding: 12, textAlign: "center" }}>{t(preview === "failed" ? "frame.previewFailed" : "frame.preparing")}</span>}
            </div>
          </div>
          <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{t("frame.text")}</span>
              <input id="frame-title" value={title} onChange={(e) => editTitle(e.target.value)} placeholder={event.name || ""} maxLength={60}
                style={{ minHeight: 40, borderRadius: 10, border: `1px solid ${C.line2}`, background: C.panel, color: C.text, padding: "0 12px", fontSize: 14 }} />
              <span style={{ fontSize: 11, color: C.second }}>{t("frame.textHelp")}</span>
            </label>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t("frame.logo")}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["fm", "mono", "none"].map((l) => (
                  <button type="button" key={l} id={`frame-logo-${l}`} onClick={() => pickLogo(l)} aria-pressed={logo === l} style={chip(logo === l)}>{t(`frame.logo.${l}`)}</button>
                ))}
              </div>
            </div>
            {style === "sponsor" && (
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t("frame.partner")}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ ...chip(false), display: "inline-flex", alignItems: "center", opacity: busy ? 0.6 : 1 }}>
                    {busy ? t("frame.uploading") : partner ? t("frame.partnerChange") : t("frame.partnerAdd")}
                    <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { uploadPartner(e.target.files[0]); e.target.value = ""; }} />
                  </label>
                  {partner && !busy && (
                    <button type="button" onClick={() => { setPartner(""); save({ frame_partner_path: null }); }} style={chip(false)}>{t("frame.partnerRemove")}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
