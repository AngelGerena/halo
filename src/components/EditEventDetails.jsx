// "Edit details" for an event that already exists: fix a typo in the name,
// rename it, or change the host / date, in English and Spanish.
//
// The event code (and so the QR link) never changes, which means QR codes a
// host already printed or shared keep working. Everything that shows the name
// (header, full-screen QR, table card, guest pages) reads it live, so it
// updates as soon as the save comes back.
//
// Props:
//   event              the current event row
//   save(patch)        persists the patch, resolves the updated event row
//   translate(items)   optional; resolves { name, host, date } Spanish suggestions
//   onSaved(updated)   called with the updated row after a successful save
import React, { useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { PencilIcon } from "./Icons.jsx";

// Saved QR file is named after the event, so a renamed event saves with its new name.
export function qrFileName(event) {
  const slug = String(event.name || "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `HALO-QR-${slug ? slug + "-" : ""}${event.code}.png`;
}

const FIELDS = [
  { en: "name", es: "name_es", tr: "name", label: "admin.eventName", labelEs: "admin.eventNameEs", max: 120, full: true },
  { en: "host", es: "host_es", tr: "host", label: "admin.hostChurch", labelEs: "admin.hostEs", max: 120 },
  { en: "event_date", es: "event_date_es", tr: "date", label: "admin.dateDisplay", labelEs: "admin.dateEs", max: 80 },
];

const pick = (event) => Object.fromEntries(FIELDS.flatMap((f) => [[f.en, event[f.en] || ""], [f.es, event[f.es] || ""]]));

export default function EditEventDetails({ event, save, translate, onSaved }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState(() => pick(event));
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [err, setErr] = useState("");

  function start() { setVals(pick(event)); setErr(""); setOpen(true); }
  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e.target.value }));

  async function autoTranslate() {
    if (!translate) return;
    const items = Object.fromEntries(FIELDS.filter((f) => vals[f.en].trim()).map((f) => [f.tr, vals[f.en].trim()]));
    if (!Object.keys(items).length) return;
    setTranslating(true); setErr("");
    try {
      const tr = (await translate(items)) || {};
      setVals((v) => ({ ...v, ...Object.fromEntries(FIELDS.filter((f) => tr[f.tr]).map((f) => [f.es, tr[f.tr]])) }));
    } catch (e) { setErr(e.message || String(e)); } finally { setTranslating(false); }
  }

  async function submit() {
    const name = vals.name.trim();
    if (!name) { setErr(t("admin.nameRequired")); return; }
    setBusy(true); setErr("");
    try {
      const next = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v.trim()]));
      // English changed but the Spanish was left alone: refresh the Spanish so
      // Spanish-language guests don't keep seeing the old name.
      const stale = FIELDS.filter((f) => next[f.en] !== (event[f.en] || "") && next[f.es] === (event[f.es] || "") && next[f.es] && next[f.en]);
      if (stale.length && translate) {
        try {
          const tr = (await translate(Object.fromEntries(stale.map((f) => [f.tr, next[f.en]])))) || {};
          stale.forEach((f) => { if (tr[f.tr]) next[f.es] = tr[f.tr]; });
        } catch { /* keep the old Spanish rather than block the save */ }
      }
      const patch = {};
      for (const [k, v] of Object.entries(next)) if (v !== (event[k] || "")) patch[k] = v || null;
      if (!Object.keys(patch).length) { setOpen(false); return; }
      const updated = await save(patch);
      onSaved && onSaved(updated || { ...event, ...patch });
      setOpen(false);
    } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" onClick={start}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, background: "rgba(255,255,255,.06)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        <PencilIcon size={13} /> {t("edit.details")}
      </button>
    );
  }

  const field = { width: "100%", maxWidth: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", marginTop: 4, background: "rgba(255,255,255,.05)", color: C.text, fontSize: 16 };
  const lab = { fontSize: 12, fontWeight: 600, color: C.text };

  return (
    <div style={{ marginTop: 12, padding: 16, borderRadius: 12, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line2}`, minWidth: 0 }}>
      <style>{`.hed-grid { display: grid; gap: 12px; grid-template-columns: minmax(0,1fr) minmax(0,1fr); } .hed-full { grid-column: 1 / -1; } @media (max-width: 640px) { .hed-grid { grid-template-columns: minmax(0,1fr); } }`}</style>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>{t("edit.title")}</div>
      <div className="hed-grid">
        {FIELDS.map((f) => (
          <div key={f.en} className={f.full ? "hed-full" : ""}>
            <label style={lab}>{t(f.label)}{f.full ? " *" : ""}</label>
            <input style={field} value={vals[f.en]} maxLength={f.max} onChange={set(f.en)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.spanishVersion")}</div>
          {translate && (
            <button type="button" onClick={autoTranslate} disabled={translating}
              style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: translating ? 0.5 : 1 }}>
              {translating ? t("admin.translating") : t("admin.autoTranslate")}
            </button>
          )}
        </div>
        {translate && <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("edit.esAuto")}</p>}
        <div className="hed-grid">
          {FIELDS.map((f) => (
            <div key={f.es} className={f.full ? "hed-full" : ""}>
              <label style={lab}>{t(f.labelEs)}</label>
              <input style={field} value={vals[f.es]} maxLength={f.max} onChange={set(f.es)} />
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: C.second, margin: "12px 0 0", lineHeight: 1.45 }}>{t("edit.qrNote")}</p>
      {err && <div style={{ color: "#ff8a80", fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={submit} disabled={busy}
          style={{ background: C.gold, color: C.ink, border: "none", padding: "11px 18px", borderRadius: 10, fontSize: 14, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
          {busy ? t("edit.saving") : t("edit.save")}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}
          style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "11px 18px", borderRadius: 10, fontSize: 14 }}>
          {t("admin.cancel")}
        </button>
      </div>
    </div>
  );
}
