import React, { useEffect, useState } from "react";
import { C } from "../../lib/score.js";
import { useI18n } from "../../lib/i18n.jsx";
import { copyText } from "../../lib/share.js";

// Host tools > the private Album link (view-only, no account), and what
// co-hosts get after the event. Saves on tap.
//   events.cohost_mode: "auto" (default) | "album" | "tools"
const MODES = [["auto", "alb.modeAuto"], ["album", "alb.modeAlbum"], ["tools", "alb.modeTools"]];

export default function AlbumHostCard({ event, api, updateEvent, isCohost, onError }) {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [linkErr, setLinkErr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState(event.cohost_mode || "auto");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    let alive = true;
    setLinkErr(false);
    api.fn("album", { eventId: event.id })
      .then((j) => { if (alive) setUrl(j.url || ""); })
      .catch(() => { if (alive) setLinkErr(true); });
    return () => { alive = false; };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copy() {
    if (!url) return;
    const ok = await copyText(url);
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1800);
    else onError && onError(new Error(t("alb.copyFailed")));
  }

  async function pick(v) {
    if (v === mode) return;
    const prev = mode;
    setMode(v); setSaved("saving");
    try {
      await updateEvent({ cohost_mode: v });
      setSaved("saved"); setTimeout(() => setSaved((s) => (s === "saved" ? "" : s)), 2200);
    } catch (e) { setMode(prev); setSaved("error"); onError && onError(e); }
  }

  const chip = (on) => ({
    minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text,
  });
  const btn = { minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none", boxSizing: "border-box" };

  return (
    <div id="album-card" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line2}` }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("alb.hostTitle")}</div>
      <p style={{ fontSize: 11.5, color: C.second, margin: "4px 0 10px", lineHeight: 1.45 }}>{t("alb.hostHelp")}</p>
      {linkErr ? (
        <div style={{ fontSize: 12, color: C.pink }}>{t("alb.linkError")}</div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" id="album-copy" onClick={copy} disabled={!url}
            style={{ ...btn, background: C.gold, color: C.ink, border: "none", opacity: url ? 1 : 0.6 }}>
            {copied ? t("admin.copied") : t("alb.copyLink")}
          </button>
          <a id="album-view" href={url || undefined} target="_blank" rel="noreferrer" aria-disabled={!url}
            style={{ ...btn, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, pointerEvents: url ? "auto" : "none", opacity: url ? 1 : 0.6 }}>
            {t("alb.view")}
          </a>
        </div>
      )}

      {!isCohost && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{t("alb.modeTitle")}</div>
            {saved && (
              <span role="status" style={{ fontSize: 11, fontWeight: 700, color: saved === "error" ? "#ff8a80" : C.gold }}>
                {saved === "saving" ? t("frame.saving") : saved === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: C.second, margin: "4px 0 10px", lineHeight: 1.45 }}>{t("alb.modeHelp")}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={t("alb.modeTitle")}>
            {MODES.map(([v, k]) => (
              <button type="button" key={v} id={`cohost-mode-${v}`} onClick={() => pick(v)} aria-pressed={mode === v} style={chip(mode === v)}>{t(k)}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
