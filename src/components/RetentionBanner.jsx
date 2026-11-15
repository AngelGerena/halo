// Host/admin view: when this event's gallery closes, with a live countdown
// and a one-tap "Download all". Closed galleries say so plainly.
import React, { useEffect, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { expiryFor, splitLeft, formatDate, RETAIN_DAYS } from "../lib/retention.js";

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2.5h6" />
    </svg>
  );
}

export default function RetentionBanner({ event, firstPhotoAt, onDownload, downloadLabel, extra }) {
  const { t, lang } = useI18n();
  const [now, setNow] = useState(Date.now());
  const expiry = expiryFor(event, firstPhotoAt);
  useEffect(() => {
    if (!expiry || event.closed_at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiry && expiry.getTime(), event.closed_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const box = (accent) => ({
    marginTop: 16, padding: "16px 18px", borderRadius: 16, background: C.card,
    border: `1px solid ${accent || "rgba(255,255,255,.1)"}`, minWidth: 0,
  });
  const head = { display: "flex", alignItems: "center", gap: 10, color: C.text, fontSize: 14, fontWeight: 800 };
  const sub = { fontSize: 12.5, color: C.second, margin: "6px 0 0", lineHeight: 1.45 };

  if (event.closed_at) {
    return (
      <div id="halo-retention" style={box()}>
        <div style={head}><span style={{ color: C.second }}><ClockIcon /></span>{t("ret.closedTitle").replace("{date}", formatDate(event.closed_at, lang))}</div>
        <p style={sub}>{t("ret.closedSub").replace("{n}", RETAIN_DAYS)}</p>
        {extra}
      </div>
    );
  }
  if (event.is_recurring) {
    return (
      <div id="halo-retention" style={box()}>
        <div style={head}><span style={{ color: C.gold }}><ClockIcon /></span>{t("ret.recurringTitle").replace("{n}", RETAIN_DAYS)}</div>
        <p style={sub}>{t("ret.recurringSub").replace("{n}", RETAIN_DAYS)}</p>
        {extra}
      </div>
    );
  }
  if (!expiry) {
    return (
      <div id="halo-retention" style={box()}>
        <div style={head}><span style={{ color: C.gold }}><ClockIcon /></span>{t("ret.notStartedTitle").replace("{n}", RETAIN_DAYS)}</div>
        <p style={sub}>{t("ret.notStartedSub")}</p>
        {extra}
      </div>
    );
  }

  const left = splitLeft(expiry, now);
  const urgent = left.days < 7;
  const accent = urgent ? "#ff8a80" : C.gold;
  const units = [
    [left.days, t("ret.days")], [left.hours, t("ret.hours")],
    [left.minutes, t("ret.minutes")], [left.seconds, t("ret.seconds")],
  ];
  return (
    <div id="halo-retention" style={box(urgent ? "rgba(255,138,128,.55)" : undefined)}>
      <style>{`
        .hret { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; justify-content: space-between; }
        .hret-units { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; min-width: 0; flex: 0 1 320px; }
        .hret-u { text-align: center; background: rgba(255,255,255,.05); border: 1px solid ${C.line2}; border-radius: 12px; padding: 8px 4px; min-width: 0; }
        .hret-u b { display: block; font-size: 24px; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .hret-u small { display: block; font-size: 10px; letter-spacing: 1.2px; text-transform: uppercase; color: ${C.second}; margin-top: 2px; }
        @media (max-width: 640px) { .hret-units { flex: 1 1 100%; } .hret-u b { font-size: 22px; } }
      `}</style>
      <div className="hret">
        <div style={{ minWidth: 0, flex: "1 1 220px" }}>
          <div style={head}><span style={{ color: accent }}><ClockIcon /></span>{t("ret.closesOn")}</div>
          <div className="serif" style={{ fontSize: 21, color: C.text, margin: "4px 0 0", lineHeight: 1.2 }}>{formatDate(expiry, lang)}</div>
          <p style={sub}>{t("ret.openSub").replace("{n}", RETAIN_DAYS)}</p>
        </div>
        <div className="hret-units" role="timer" aria-label={t("ret.closesOn")}>
          {units.map(([v, l]) => (
            <div className="hret-u" key={l}><b style={{ color: accent }}>{String(v).padStart(2, "0")}</b><small>{l}</small></div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {onDownload && (
          <button type="button" onClick={onDownload}
            style={{ background: C.gold, color: C.ink, border: "none", padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
            {downloadLabel || t("ret.downloadAll")}
          </button>
        )}
        <span style={{ fontSize: 12, color: C.second }}>{t("ret.emailNote")}</span>
      </div>
      {extra}
    </div>
  );
}
