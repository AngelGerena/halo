import React, { useEffect, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { saveBlob } from "../lib/zipDownload.js";
import { leadsCsv } from "../lib/leads.js";

// Manage > Leads (only while the event's lead capture is on). Contact details
// are never read from the browser database; they come from the host-only
// event-leads function.
export default function LeadsSection({ event, api, mode }) {
  const { t } = useI18n();
  const [info, setInfo] = useState(null); // { count, marketing } | "error"
  const [busy, setBusy] = useState(false);
  const on = mode && mode !== "off";

  useEffect(() => {
    if (!on) return;
    let alive = true;
    setInfo(null);
    api.fn("event-leads", { eventId: event.id })
      .then((j) => { if (alive) setInfo({ count: j.count || 0, marketing: j.marketing || 0 }); })
      .catch(() => { if (alive) setInfo("error"); });
    return () => { alive = false; };
  }, [on, event.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!on) return null;

  async function download() {
    setBusy(true);
    try {
      const j = await api.fn("event-leads", { eventId: event.id });
      const leads = j.leads || [];
      setInfo({ count: leads.length, marketing: leads.filter((l) => l.marketing_ok).length });
      await saveBlob(new Blob([leadsCsv(leads, t)], { type: "text/csv;charset=utf-8" }), `HALO_${event.code}_leads.csv`);
    } catch { setInfo("error"); }
    finally { setBusy(false); }
  }

  return (
    <section id="leads" style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "14px 18px" }}>
      <div style={{ fontWeight: 800, color: C.text, fontSize: 15 }}>{t("leadcap.title")}</div>
      <p style={{ fontSize: 12, color: C.second, margin: "6px 0 10px", lineHeight: 1.5 }}>{t("leadcap.help")}</p>
      <div role="status" data-testid="leads-count" style={{ fontSize: 13, color: info === "error" ? "#ff8a80" : C.text, marginBottom: 10 }}>
        {info === "error" ? t("leadcap.error") : !info ? `${t("leadcap.loading")}...` : info.count === 0 ? t("leadcap.none")
          : t("leadcap.count").replace("{n}", info.count).replace("{m}", info.marketing)}
      </div>
      <button type="button" id="leads-download" onClick={download} disabled={busy}
        style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8, background: C.gold, color: C.onInk, border: "none", padding: "0 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.7 : 1 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5 12 15.5l5-5M5 20h14" /></svg>
        {busy ? `${t("leadcap.downloading")}...` : t("leadcap.download")}
      </button>
    </section>
  );
}
