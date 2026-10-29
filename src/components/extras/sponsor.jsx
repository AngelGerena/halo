import React, { useEffect, useRef, useState } from "react";
import { C } from "../../lib/score.js";
import { publicUrl } from "../../lib/supabase.js";
import { putToR2 } from "../../lib/r2upload.js";
import { useI18n } from "../../lib/i18n.jsx";

// Manage > Event settings > Extras > Sponsor. Sponsor name (events.sponsor_name)
// and logo (events.frame_partner_path, shared with the Sponsor photo frame).
// Nothing shows to guests or on the wall until a logo is added.
export default function SponsorPanel({ event, updateEvent, api, onError }) {
  const { t } = useI18n();
  const [name, setName] = useState(event.sponsor_name || "");
  const [logo, setLogo] = useState(event.frame_partner_path || "");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(""); // "" | saving | saved | error
  const timer = useRef(null);

  async function save(patch) {
    setState("saving");
    try { await updateEvent(patch); setState("saved"); setTimeout(() => setState((s) => (s === "saved" ? "" : s)), 2000); }
    catch (e) { setState("error"); onError && onError(e); }
  }
  function editName(v) {
    setName(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save({ sponsor_name: v.trim() || null }), 800);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  // Same upload path as the Sponsor frame's partner logo (FrameSettings.jsx).
  async function upload(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", {
        kind: "cover", eventId: event.id, filename: file.name, contentType: file.type || "image/png",
      });
      await putToR2(uploadUrl, file, contentType);
      setLogo(path);
      await save({ frame_partner_path: path });
    } catch (e) { onError && onError(e); } finally { setBusy(false); }
  }

  const btn = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${C.line2}`, background: "transparent", color: C.text };
  const logoUrl = logo ? publicUrl(logo) : null;

  return (
    <div id="extra-sponsor">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("sponsor.title")}</div>
        {state && (
          <span role="status" style={{ fontSize: 11, fontWeight: 700, color: state === "error" ? "#ff8a80" : C.gold }}>
            {state === "saving" ? t("frame.saving") : state === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: C.second, lineHeight: 1.45, marginTop: 2 }}>{t("sponsor.help")}</div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{t("sponsor.name")}</span>
        <input id="sponsor-name" value={name} onChange={(e) => editName(e.target.value)} placeholder={t("sponsor.namePh")} maxLength={80}
          style={{ minHeight: 44, width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line2}`, background: C.panel, color: C.text, padding: "0 12px", fontSize: 16 }} />
      </label>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>{t("sponsor.logo")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {logoUrl && (
            <span style={{ display: "grid", placeItems: "center", height: 44, minWidth: 44, maxWidth: 140, padding: "0 8px", borderRadius: 10, border: `1px solid ${C.line2}`, background: "rgba(255,255,255,.06)" }}>
              <img src={logoUrl} alt="" style={{ maxHeight: 34, maxWidth: 124, objectFit: "contain", display: "block" }} />
            </span>
          )}
          <label style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
            {busy ? t("sponsor.uploading") : logo ? t("sponsor.logoChange") : t("sponsor.logoAdd")}
            <input id="sponsor-logo-input" type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} />
          </label>
          {logo && !busy && (
            <button type="button" id="sponsor-logo-remove" onClick={() => { setLogo(""); save({ frame_partner_path: null }); }} style={btn}>{t("sponsor.logoRemove")}</button>
          )}
        </div>
        <div style={{ fontSize: 11, color: C.second, marginTop: 6, lineHeight: 1.45 }}>{t("sponsor.sameLogo")}</div>
      </div>
    </div>
  );
}
