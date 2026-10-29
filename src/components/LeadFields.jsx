import React from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { leadMode, wantsPhone, consentText } from "../lib/leads.js";

// Lead capture extras for the guest's "Who should we thank?" card: an optional
// phone field and a marketing consent box (unchecked by default). Renders
// nothing when the event's lead capture is off. Everything stays optional,
// photos never wait on it.
export default function LeadFields({ event, phone, setPhone, consent, setConsent, error, onEnter }) {
  const { t, ev } = useI18n();
  const mode = leadMode(event);
  if (mode === "off") return null;
  const text = consentText(event, t, ev(event, "name"));
  return (
    <div data-testid="lead-fields">
      {wantsPhone(mode) && (
        <input className="field" id="lead-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24}
          value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("leadcap.phone")}
          onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()} style={{ marginBottom: 12 }} />
      )}
      <label htmlFor="lead-consent" style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44, cursor: "pointer", marginBottom: 6 }}>
        <input id="lead-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          style={{ flex: "0 0 auto", width: 22, height: 22, margin: "1px 0 0", accentColor: C.gold, cursor: "pointer" }} />
        <span style={{ minWidth: 0, fontSize: 13, color: C.text, lineHeight: 1.4, overflowWrap: "anywhere" }}>
          {text}
          <span style={{ display: "block", fontSize: 11.5, color: C.second, marginTop: 2 }}>{t("leadcap.consentNote")}</span>
        </span>
      </label>
      {error && <div role="alert" style={{ fontSize: 12.5, color: "#ff8a80", margin: "0 0 10px" }}>{error}</div>}
    </div>
  );
}
