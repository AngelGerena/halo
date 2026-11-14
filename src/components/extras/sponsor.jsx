import React, { useEffect, useRef, useState } from "react";
import { C } from "../../lib/score.js";
import { publicUrl } from "../../lib/supabase.js";
import { putToR2 } from "../../lib/r2upload.js";
import { useI18n } from "../../lib/i18n.jsx";
import { LAYOUTS, MOMENTS, TIERS, MAX_SPONSORS } from "../../lib/sponsors.js";

// Manage > Event settings > Extras > Sponsors.
// A list of sponsors (name, tier, logo, short message, optional wall moment),
// the live-wall layout, how often the sponsors card / break shows, and the
// Sponsored moments switch. Saves as the host edits. The presenting sponsor is
// also written to sponsor_name + frame_partner_path, so the Sponsor photo
// frame and the lead-capture consent line keep using it.

const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 12));

function startList(event) {
  const raw = Array.isArray(event.sponsors) ? event.sponsors : [];
  if (raw.length) return raw.map((s) => ({ id: s.id || newId(), name: s.name || "", tier: TIERS.includes(s.tier) ? s.tier : "gold", logo_path: s.logo_path || null, message: s.message || "", moment: s.moment || null }));
  // Older events: their one sponsor becomes the presenting sponsor.
  const legacyLogo = event.frame_partner_path && String(event.frame_partner_path).startsWith(`covers/${event.id}/`) ? event.frame_partner_path : null;
  if (event.sponsor_name || legacyLogo) return [{ id: newId(), name: event.sponsor_name || "", tier: "presenting", logo_path: legacyLogo, message: "", moment: null }];
  return [];
}

export default function SponsorPanel({ event, updateEvent, api, onError }) {
  const { t } = useI18n();
  const [list, setList] = useState(() => startList(event));
  const [layout, setLayout] = useState(LAYOUTS.includes(event.sponsor_layout) ? event.sponsor_layout : "corner");
  const [every, setEvery] = useState(event.sponsor_card_minutes == null ? 10 : event.sponsor_card_minutes);
  const [moments, setMoments] = useState(!!event.sponsor_moments);
  const [busyId, setBusyId] = useState("");
  const [state, setState] = useState(""); // "" | saving | saved | error
  const timer = useRef(null);
  const latest = useRef(list);
  latest.current = list;

  async function save(patch) {
    setState("saving");
    try { await updateEvent(patch); setState("saved"); setTimeout(() => setState((s) => (s === "saved" ? "" : s)), 2000); }
    catch (e) { setState("error"); onError && onError(e); }
  }
  function listPatch(l) {
    const keep = l.filter((s) => s.name.trim() || s.logo_path);
    const pres = keep.find((s) => s.tier === "presenting");
    return {
      sponsors: keep.map((s) => ({ id: s.id, name: s.name.trim(), tier: s.tier, logo_path: s.logo_path || null, message: s.message.trim(), moment: s.moment || null })),
      sponsor_name: pres ? (pres.name.trim() || null) : null,
      frame_partner_path: pres ? (pres.logo_path || null) : null,
    };
  }
  function commit(next, now) {
    setList(next);
    clearTimeout(timer.current);
    if (now) save(listPatch(next));
    else timer.current = setTimeout(() => save(listPatch(latest.current)), 800);
  }
  useEffect(() => () => clearTimeout(timer.current), []);

  function edit(id, patch, now) {
    let next = list.map((s) => (s.id === id ? { ...s, ...patch } : s));
    // Only one presenting sponsor: picking a new one moves the old one to Gold.
    if (patch.tier === "presenting") next = next.map((s) => (s.id !== id && s.tier === "presenting" ? { ...s, tier: "gold" } : s));
    // One sponsor per moment.
    if (patch.moment) next = next.map((s) => (s.id !== id && s.moment === patch.moment ? { ...s, moment: null } : s));
    commit(next, now);
  }
  function add() {
    if (list.length >= MAX_SPONSORS) return;
    const tier = list.some((s) => s.tier === "presenting") ? "gold" : "presenting";
    setList([...list, { id: newId(), name: "", tier, logo_path: null, message: "", moment: null }]);
  }
  function remove(id) { commit(list.filter((s) => s.id !== id), true); }
  function move(id, d) {
    const i = list.findIndex((s) => s.id === id), j = i + d;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = list.slice(); [next[i], next[j]] = [next[j], next[i]];
    commit(next, true);
  }
  async function upload(id, file) {
    if (!file || !file.type.startsWith("image/")) return;
    setBusyId(id);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", { kind: "cover", eventId: event.id, filename: file.name, contentType: file.type || "image/png" });
      await putToR2(uploadUrl, file, contentType);
      const next = latest.current.map((s) => (s.id === id ? { ...s, logo_path: path } : s));
      commit(next, true);
    } catch (e) { onError && onError(e); } finally { setBusyId(""); }
  }

  const chip = (on) => ({ minHeight: 40, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: `1px solid ${on ? C.gold : C.line2}`, background: on ? C.gold : "transparent", color: on ? C.ink : C.text });
  const btn = { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: `1.5px solid color-mix(in srgb, var(--gold) 70%, transparent)`, background: "color-mix(in srgb, var(--gold) 14%, transparent)", color: C.text };
  const iconBtn = { width: 44, height: 44, display: "grid", placeItems: "center", borderRadius: 12, border: `1px solid ${C.line2}`, background: "transparent", color: C.text, cursor: "pointer" };
  const field = { minHeight: 44, width: "100%", boxSizing: "border-box", borderRadius: 10, border: `1px solid ${C.line2}`, background: C.panel, color: C.text, padding: "0 12px", fontSize: 16 };
  const label = { fontSize: 11.5, fontWeight: 700, color: C.text };
  const help = { fontSize: 11, color: C.second, lineHeight: 1.45 };

  return (
    <div id="extra-sponsor">
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("spons.title")}</div>
        {state && (
          <span role="status" style={{ fontSize: 11, fontWeight: 700, color: state === "error" ? "#ff8a80" : C.gold }}>
            {state === "saving" ? t("frame.saving") : state === "saved" ? t("frame.savedSetting") : t("frame.saveError")}
          </span>
        )}
      </div>
      <div style={{ ...help, fontSize: 11.5, marginTop: 2 }}>{t("spons.help")}</div>

      {/* ---- sponsor list ---- */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
        {list.map((s, i) => {
          const logoUrl = s.logo_path ? publicUrl(s.logo_path) : null;
          return (
            <div key={s.id} data-testid="sponsor-item" style={{ border: `1px solid ${C.line2}`, borderRadius: 14, padding: 12, display: "flex", flexDirection: "column", gap: 10, background: "rgba(255,255,255,.02)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ ...btn, minWidth: 64, padding: 0, width: 64, height: 52, borderRadius: 12, overflow: "hidden", opacity: busyId === s.id ? 0.6 : 1 }} aria-label={t("sponsor.logoAdd")}>
                  {logoUrl ? <img src={logoUrl} alt="" style={{ maxWidth: 56, maxHeight: 44, objectFit: "contain", display: "block" }} />
                    : <span style={{ fontSize: 10.5, textAlign: "center", lineHeight: 1.1 }}>{busyId === s.id ? t("sponsor.uploading") : t("spons.addLogo")}</span>}
                  <input id={`spons-logo-${i}`} type="file" accept="image/*" hidden disabled={busyId === s.id} onChange={(e) => { upload(s.id, e.target.files[0]); e.target.value = ""; }} />
                </label>
                <input id={`spons-name-${i}`} value={s.name} onChange={(e) => edit(s.id, { name: e.target.value })} placeholder={t("sponsor.namePh")} maxLength={80} aria-label={t("sponsor.name")} style={{ ...field, flex: "1 1 160px", width: "auto", minWidth: 0 }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label={t("spons.tier")}>
                {TIERS.map((tr) => (
                  <button type="button" key={tr} id={`spons-tier-${i}-${tr}`} aria-pressed={s.tier === tr} onClick={() => edit(s.id, { tier: tr }, true)} style={chip(s.tier === tr)}>{t("spons.tier." + tr)}</button>
                ))}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={label}>{t("spons.message")}</span>
                <input id={`spons-msg-${i}`} value={s.message} onChange={(e) => edit(s.id, { message: e.target.value })} maxLength={160} placeholder={t("spons.messagePh")} style={field} />
              </label>
              {moments && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={label}>{t("spons.moment")}</span>
                  <select id={`spons-moment-${i}`} value={s.moment || ""} onChange={(e) => edit(s.id, { moment: e.target.value || null }, true)} style={field}>
                    <option value="">{t("spons.moment.none")}</option>
                    {MOMENTS.map((m) => <option key={m} value={m}>{t("spons.moment." + m)}</option>)}
                  </select>
                </label>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => move(s.id, -1)} disabled={i === 0} aria-label={t("spons.up")} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
                </button>
                <button type="button" onClick={() => move(s.id, 1)} disabled={i === list.length - 1} aria-label={t("spons.down")} style={{ ...iconBtn, opacity: i === list.length - 1 ? 0.4 : 1 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>
                <button type="button" id={`spons-remove-${i}`} onClick={() => remove(s.id)} style={{ ...btn, marginLeft: "auto", borderColor: C.line2, background: "transparent" }}>{t("spons.remove")}</button>
              </div>
            </div>
          );
        })}
        {list.length < MAX_SPONSORS && (
          <button type="button" id="spons-add" onClick={add} style={{ ...btn, alignSelf: "flex-start" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ marginRight: 6 }}><path d="M12 5v14M5 12h14" /></svg>
            {t("spons.add")}
          </button>
        )}
      </div>

      {/* ---- wall layout ---- */}
      <div style={{ marginTop: 18 }}>
        <div style={label}>{t("spons.layout")}</div>
        <div style={{ ...help, margin: "2px 0 8px" }}>{t("spons.layoutHelp")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }} role="group" aria-label={t("spons.layout")}>
          {LAYOUTS.map((l) => (
            <button type="button" key={l} id={`spons-layout-${l}`} aria-pressed={layout === l} onClick={() => { setLayout(l); save({ sponsor_layout: l }); }}
              style={{ textAlign: "left", minHeight: 64, padding: "10px 12px", borderRadius: 14, cursor: "pointer",
                border: `1.5px solid ${layout === l ? C.gold : C.line2}`, background: layout === l ? "color-mix(in srgb, var(--gold) 18%, transparent)" : "transparent", color: C.text }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{t("spons.layout." + l)}</div>
              <div style={{ fontSize: 11, color: C.second, lineHeight: 1.35, marginTop: 2 }}>{t("spons.layout." + l + ".d")}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ---- card / break frequency ---- */}
      <div style={{ marginTop: 16 }}>
        <div style={label}>{layout === "breaks" ? t("spons.breakEvery") : t("spons.cardEvery")}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }} role="group">
          {[5, 10, 20, 0].map((m) => (
            <button type="button" key={m} id={`spons-every-${m}`} aria-pressed={every === m} onClick={() => { setEvery(m); save({ sponsor_card_minutes: m }); }} style={chip(every === m)}>
              {m === 0 ? t("board.off") : t("board.every").replace("{n}", m)}
            </button>
          ))}
        </div>
      </div>

      {/* ---- sponsored moments ---- */}
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, cursor: "pointer" }}>
        <input id="spons-moments" type="checkbox" checked={moments} onChange={(e) => { setMoments(e.target.checked); save({ sponsor_moments: e.target.checked }); }}
          style={{ width: 22, height: 22, marginTop: 1, accentColor: "var(--gold)", flex: "0 0 auto" }} />
        <span>
          <span style={label}>{t("spons.moments")}</span>
          <span style={{ ...help, display: "block", marginTop: 2 }}>{t("spons.momentsHelp")}</span>
        </span>
      </label>
    </div>
  );
}
