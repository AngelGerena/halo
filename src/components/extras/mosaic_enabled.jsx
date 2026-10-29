import React, { useState } from "react";
import { supabase, publicUrl } from "../../lib/supabase.js";
import { C } from "../../lib/score.js";
import { useI18n } from "../../lib/i18n.jsx";
import { MosaicCanvas, mosaicTarget } from "../MosaicWall.jsx";
import { mosaicPhotos, MAX_THUMBS } from "../../lib/mosaic.js";

// Manage > Extras > Photo mosaic: a short note, plus an on-demand mini
// preview drawn with the same code the live wall uses. Nothing loads until
// the host taps "Show preview".
export default function MosaicSettings({ event }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(""); // "" | loading | error
  const [photos, setPhotos] = useState(null);
  const [used, setUsed] = useState(0);

  async function load() {
    setOpen(true); setState("loading");
    try {
      const { data, error } = await supabase.from("photos").select("*")
        .eq("event_id", event.id).eq("kept", true).eq("status", "approved")
        .order("created_at", { ascending: false }).limit(MAX_THUMBS);
      if (error) throw error;
      setPhotos((data || []).map((p) => ({ ...p, url: publicUrl(p.edited_path || p.storage_path) })));
      setState("");
    } catch { setState("error"); }
  }

  const list = photos ? mosaicPhotos(photos) : [];
  const target = photos ? mosaicTarget(event, list, null) : null;
  const btn = { minHeight: 44, padding: "0 16px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${C.line2}`, background: "transparent", color: C.text, display: "inline-flex", alignItems: "center", gap: 8 };

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ fontSize: 11.5, color: C.second, lineHeight: 1.5, margin: "0 0 8px" }}>{t("mosaic.note")}</p>
      {!event.cover_path && <p style={{ fontSize: 11.5, color: C.gold, lineHeight: 1.5, margin: "0 0 8px" }}>{t("mosaic.noCover")}</p>}
      <button type="button" id="mosaic-preview-btn" style={btn} onClick={() => (open ? setOpen(false) : load())}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.2" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.2" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.2" fill="currentColor" /></svg>
        {open ? t("mosaic.hidePreview") : t("mosaic.preview")}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {state === "error" ? <p style={{ fontSize: 12, color: "#ff8a80", margin: 0 }}>{t("mosaic.previewError")}</p>
            : state === "loading" ? null
            : !target ? <p style={{ fontSize: 12, color: C.second, margin: 0 }}>{t("mosaic.previewEmpty")}</p>
            : (
              <>
                <div id="mosaic-preview" style={{ width: "100%", maxWidth: 520, aspectRatio: "16 / 9", borderRadius: 12, overflow: "hidden", border: `1px solid ${C.line2}`, background: "#0a0410" }}>
                  <MosaicCanvas target={target} photos={list} seed={String(event.id)} onStats={(s) => setUsed(s.used)} />
                </div>
                <p style={{ fontSize: 11.5, color: C.second, margin: "6px 0 0" }}>{t("mosaic.previewStats").replace("{n}", used)}</p>
              </>
            )}
        </div>
      )}
    </div>
  );
}
