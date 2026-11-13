import React, { useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

// Manage > settings: how often the live wall shows "Top photographers tonight".
// Saves on tap. events.leaderboard_minutes: 5, 10 or 20, 0 = off, null = 10.
const OPTIONS = [5, 10, 20, 0];

export default function LeaderboardSetting({ event, updateEvent, onError }) {
  const { t } = useI18n();
  const start = event.leaderboard_minutes == null ? 10 : event.leaderboard_minutes;
  const [val, setVal] = useState(OPTIONS.includes(start) ? start : 10);
  const [saved, setSaved] = useState("");

  async function pick(v) {
    if (v === val) return;
    const prev = val;
    setVal(v); setSaved("saving");
    try {
      await updateEvent({ leaderboard_minutes: v });
      setSaved("saved"); setTimeout(() => setSaved((s) => (s === "saved" ? "" : s)), 2200);
    } catch (e) { setVal(prev); setSaved("error"); onError && onError(e); }
  }

  const chip = (on) => ({
    minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text,
  });

  return (
    <div id="set-leaderboard" style={{ marginBottom: 18, borderBottom: `1px solid ${C.line}`, padding: "8px 8px 16px", marginLeft: -8, marginRight: -8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("board.setTitle")}</div>
        {saved && (
          <span role="status" style={{ fontSize: 11, fontWeight: 700, color: saved === "error" ? "#ff8a80" : C.gold }}>
            {saved === "saving" ? t("frame.saving") : saved === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
          </span>
        )}
      </div>
      <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px", lineHeight: 1.5 }}>{t("board.setHelp")}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label={t("board.setTitle")}>
        {OPTIONS.map((m) => (
          <button type="button" key={m} id={`board-${m}`} onClick={() => pick(m)} aria-pressed={val === m} style={chip(val === m)}>
            {m === 0 ? t("board.off") : t("board.every").replace("{n}", m)}
          </button>
        ))}
      </div>
    </div>
  );
}
