import React, { useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

// Feature option panels: a file src/components/extras/<setting_key>.jsx
// exporting default ({ event, updateEvent, api, onError }) shows under that
// switch while it's on (e.g. extras/mosaic_enabled.jsx). "lead_capture.jsx"
// shows under Lead capture; "sponsor.jsx" shows as its own row.
const PANELS = Object.fromEntries(Object.entries(import.meta.glob("./extras/*.jsx", { eager: true }))
  .map(([path, m]) => [path.split("/").pop().replace(/\.jsx$/, ""), m.default]).filter(([, c]) => typeof c === "function"));

// Manage > Event settings > Extras. Each extra is off by default and saves the
// moment it's switched, so a host can turn things on for one event without
// touching any other event. Feature-specific options live under each switch
// (passed in as `children` by key from EventManager when a feature needs them).
export const EXTRAS = [
  { key: "boomerang_enabled", label: "extras.boomerang", help: "extras.boomerang.help" },
  { key: "video_guestbook_enabled", label: "extras.videoGuestbook", help: "extras.videoGuestbook.help" },
  { key: "filters_enabled", label: "extras.filters", help: "extras.filters.help" },
  { key: "mosaic_enabled", label: "extras.mosaic", help: "extras.mosaic.help" },
];

function Switch({ on, onChange, id, label }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ flexShrink: 0, width: 50, height: 30, borderRadius: 999, border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", position: "relative", cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: on ? C.ink : C.second, transition: "left .2s ease" }} />
    </button>
  );
}

export default function EventExtras({ event, updateEvent, api, onError }) {
  const { t } = useI18n();
  const [vals, setVals] = useState(() => {
    const v = {}; EXTRAS.forEach((x) => { v[x.key] = !!event[x.key]; });
    v.lead_capture = event.lead_capture || "off";
    return v;
  });
  const [state, setState] = useState(""); // "" | saving | saved | error

  async function save(patch) {
    setVals((v) => ({ ...v, ...patch }));
    setState("saving");
    try { await updateEvent(patch); setState("saved"); setTimeout(() => setState((s) => (s === "saved" ? "" : s)), 2000); }
    catch (e) { setState("error"); onError && onError(e); }
  }
  const panel = (k) => { const P = PANELS[k]; return P ? <P event={event} updateEvent={updateEvent} api={api} onError={onError} /> : null; };

  const row = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "10px 0", borderTop: `1px solid ${C.line}` };
  const chip = (on) => ({ minHeight: 38, padding: "0 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text });

  return (
    <div id="set-extras" style={{ marginBottom: 18, borderBottom: `1px solid ${C.line}`, padding: "8px 8px 16px", marginLeft: -8, marginRight: -8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("extras.title")}</div>
        {state && (
          <span role="status" style={{ fontSize: 11, fontWeight: 700, color: state === "error" ? "#ff8a80" : C.gold }}>
            {state === "saving" ? t("frame.saving") : state === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.second, margin: "4px 0 6px", lineHeight: 1.5 }}>{t("extras.help")}</p>

      {EXTRAS.map((x) => (
        <div key={x.key}>
          <div style={row}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t(x.label)}</div>
              <div style={{ fontSize: 11.5, color: C.second, lineHeight: 1.45, marginTop: 2 }}>{t(x.help)}</div>
            </div>
            <Switch id={`extra-${x.key}`} on={vals[x.key]} label={t(x.label)} onChange={(v) => save({ [x.key]: v })} />
          </div>
          {vals[x.key] && PANELS[x.key] ? <div style={{ paddingBottom: 10 }}>{panel(x.key)}</div> : null}
        </div>
      ))}

      <div style={row}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("extras.leads")}</div>
          <div style={{ fontSize: 11.5, color: C.second, lineHeight: 1.45, marginTop: 2 }}>{t("extras.leads.help")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }} role="group" aria-label={t("extras.leads")}>
            {["off", "email", "phone", "both"].map((m) => (
              <button type="button" key={m} id={`lead-${m}`} aria-pressed={vals.lead_capture === m} onClick={() => save({ lead_capture: m })} style={chip(vals.lead_capture === m)}>{t(`extras.leads.${m}`)}</button>
            ))}
          </div>
          {PANELS.lead_capture && vals.lead_capture !== "off" ? <div style={{ marginTop: 10 }}>{panel("lead_capture")}</div> : null}
        </div>
      </div>
      {PANELS.sponsor ? <div style={row}><div style={{ minWidth: 0, flex: 1 }}>{panel("sponsor")}</div></div> : null}
    </div>
  );
}
