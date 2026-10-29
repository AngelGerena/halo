import React, { useRef, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { probeClip } from "../lib/clip.js";
import { uploadVideoMessage, messageTooLong } from "../lib/videoMessage.js";

// Guest page, inside the "Leave a message" card (only when the event has the
// video guestbook switched on). One button opens the FRONT camera in video
// mode (on iPhone Safari, <input capture="user"> is the reliable way), the
// clip is checked for length on the phone, then sent like any other clip.
//
// Props:
//   event       the event row
//   getGuest()  resolves to the guest ({ id, name, anon, secret }), creating
//               the anonymous guest first if needed; null if offline
//   guestName   the name typed in the guestbook's name box (anonymous guests)
//   onRenamed(c) called with the updated guest when we saved that name
export default function VideoMessage({ event, getGuest, guestName, onRenamed }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | checking | sending | sent | long | error
  const [pct, setPct] = useState(null);
  const [held, setHeld] = useState(false);
  const lastFile = useRef(null);

  async function send(file) {
    if (!file) return;
    lastFile.current = file;
    setPct(null);
    setState("checking");
    try {
      const info = await probeClip(file);
      if (messageTooLong(file, info)) { setState("long"); return; }
      const who = await getGuest();
      if (!who) { setState("error"); return; }
      setState("sending");
      const row = await uploadVideoMessage({ event, who, file, info, onProgress: (f) => setPct(Math.round(f * 100)) });
      setHeld(row.status === "pending");
      setState("sent");
      lastFile.current = null;
      // So the hosts know who it's from: save the name they typed above.
      const nm = (guestName || "").trim();
      if (nm && (who.anon || who.name === "Guest")) {
        fetch("/.netlify/functions/rename-contributor", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributorId: who.id, secret: who.secret || null, name: nm, email: null }),
        }).then((r) => (r.ok ? r.json() : null)).then((j) => {
          if (j && j.contributor && onRenamed) onRenamed({ id: who.id, name: j.contributor.name, anon: false, secret: who.secret });
        }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setState("error");
    }
  }

  const busy = state === "checking" || state === "sending";
  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, background: "rgba(var(--tint, 255,255,255),.06)", color: C.text, border: `1px solid ${C.line2}`, padding: "10px 16px", borderRadius: 999, fontSize: 14, fontWeight: 700, cursor: "pointer", maxWidth: "100%" };
  const icon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="2" /><path d="m15.5 10.5 5-3v9l-5-3" /><circle cx="9.25" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );

  return (
    <div data-testid="vgb-guest" style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
      <input ref={inputRef} data-testid="vgb-input" type="file" accept="video/*" capture="user" hidden
        onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; send(f); }} />

      {state === "sent" ? (
        <div role="status" style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 180px" }}>
            <div style={{ color: C.gold, fontWeight: 800, fontSize: 14 }}>{t("vgb.thanks")}</div>
            <div style={{ color: C.second, fontSize: 12, marginTop: 2 }}>{held ? t("vgb.thanksHeld") : t("vgb.thanksSub")}</div>
          </div>
          <button type="button" onClick={() => { setState("idle"); inputRef.current?.click(); }} style={btn}>{icon}{t("vgb.another")}</button>
        </div>
      ) : busy ? (
        <div role="status" aria-live="polite">
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, fontWeight: 600 }}>
            <span className="spin" style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: "50%", border: `2px solid rgba(var(--tint, 255,255,255),.18)`, borderTopColor: C.gold, display: "inline-block" }} />
            <span>{state === "checking" ? t("vgb.checking") : t("vgb.sending")}&hellip;</span>
            {state === "sending" && pct != null && <span style={{ color: C.gold, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>}
          </div>
          <div style={{ fontSize: 11.5, color: C.second, marginTop: 4 }}>{t("vgb.keepOpen")}</div>
        </div>
      ) : (
        <>
          {(state === "long" || state === "error") && (
            <div role="alert" style={{ marginBottom: 10, background: "rgba(255,61,129,.1)", border: "1px solid rgba(255,61,129,.35)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: C.text, lineHeight: 1.4 }}>
              {state === "long" ? t("vgb.tooLong") : t("vgb.error")}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" data-testid="vgb-record" onClick={() => (state === "error" && lastFile.current ? send(lastFile.current) : inputRef.current?.click())} style={btn}>
              {icon}{state === "long" ? t("vgb.recordAgain") : state === "error" && lastFile.current ? t("vgb.tryAgain") : t("vgb.record")}
            </button>
            {state === "idle" && <span style={{ fontSize: 11.5, color: C.second, minWidth: 0 }}>{t("vgb.recordSub")}</span>}
          </div>
        </>
      )}
    </div>
  );
}
