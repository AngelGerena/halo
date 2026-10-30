import React, { useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

// "Email me a new confirmation link" for a host whose account isn't confirmed
// yet. HALO sends the link itself (netlify/functions/resend-confirm.js); the
// server always answers ok, so this never reveals whether an address exists.
export default function ResendConfirm({ email }) {
  const { t } = useI18n();
  const [state, setState] = useState("idle"); // idle | busy | sent | error
  const addr = (email || "").trim();

  async function send() {
    if (!addr || state === "busy") return;
    setState("busy");
    try {
      const r = await fetch("/.netlify/functions/resend-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      setState(r.ok ? "sent" : "error");
    } catch { setState("error"); }
  }

  return (
    <div style={{ marginTop: 12, textAlign: "center" }}>
      {state === "sent" ? (
        <p role="status" style={{ margin: 0, color: C.text, fontSize: 13.5, lineHeight: 1.5 }}>
          {t("confirm.sent").replace("{email}", addr)}
        </p>
      ) : (
        <button type="button" onClick={send} disabled={!addr || state === "busy"} className="btn-soft"
          style={{ width: "100%", minHeight: 44, padding: "10px 14px", fontSize: 14, opacity: !addr || state === "busy" ? 0.6 : 1 }}>
          {state === "busy" ? t("confirm.sending") : t("confirm.resend")}
        </button>
      )}
      {state === "error" && (
        <p role="alert" style={{ margin: "8px 0 0", color: C.second, fontSize: 12.5 }}>{t("confirm.error")}</p>
      )}
    </div>
  );
}
