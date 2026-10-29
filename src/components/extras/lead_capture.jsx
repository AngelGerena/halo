import React, { useEffect, useRef, useState } from "react";
import { C } from "../../lib/score.js";
import { useI18n } from "../../lib/i18n.jsx";

// Manage > Extras > Lead capture (shown while it's not Off): the consent line
// guests see next to the checkbox. Blank = the default wording.
export default function LeadCapturePanel({ event, updateEvent, onError }) {
  const { t } = useI18n();
  const [text, setText] = useState(event.lead_consent_text || "");
  const timer = useRef(null);
  function edit(v) {
    setText(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Promise.resolve(updateEvent({ lead_consent_text: v.trim() || null })).catch((e) => onError && onError(e));
    }, 800);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: C.text }}>{t("leadcap.consentLabel")}</span>
      <input id="lead-consent-text" value={text} onChange={(e) => edit(e.target.value)} maxLength={200}
        placeholder={t("leadcap.consentDefault").replace("{name}", (event.sponsor_name || event.name || "").trim())}
        style={{ minHeight: 44, width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line2}`, background: C.panel, color: C.text, padding: "0 12px", fontSize: 16 }} />
      <span style={{ fontSize: 11, color: C.second, lineHeight: 1.45 }}>{t("leadcap.consentHelp")}</span>
    </label>
  );
}
