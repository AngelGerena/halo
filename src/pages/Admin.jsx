import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { Header, Footer, Stat, Spinner, Empty } from "../components/UI.jsx";
import { useI18n } from "../lib/i18n.jsx";

const TOKEN_KEY = "halo_admin_token";

export default function Admin() {
  const { t } = useI18n();
  const [token, setToken] = useState(sessionStorage.getItem(TOKEN_KEY) || "");
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      if (!token) { setChecking(false); return; }
      const ok = await verify(token);
      setAuthed(ok);
      setChecking(false);
    })();
  }, []);

  async function verify(pass) {
    try {
      const r = await fetch("/.netlify/functions/admin-auth", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: pass }),
      });
      return r.ok;
    } catch { return false; }
  }

  if (checking) return <Shell><Spinner label={t("admin.checking")} /></Shell>;
  if (!authed) return <Shell><Gate onAuth={(tok) => { sessionStorage.setItem(TOKEN_KEY, tok); setToken(tok); setAuthed(true); }} verify={verify} /></Shell>;
  return <Shell><Dashboard token={token} onLogout={() => { sessionStorage.removeItem(TOKEN_KEY); setAuthed(false); setToken(""); }} /></Shell>;
}

function Gate({ onAuth, verify }) {
  const { t } = useI18n();
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr("");
    const ok = await verify(pass);
    setBusy(false);
    if (ok) onAuth(pass); else setErr(t("admin.incorrect"));
  }
  return (
    <div style={{ maxWidth: 380, margin: "40px auto 0", background: C.white, border: "1px solid rgba(28,38,64,.1)", borderRadius: 16, padding: 26 }}>
      <div style={{ display: "inline-flex", padding: "5px 12px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{t("admin.super")}</div>
      <h2 className="serif" style={{ fontSize: 28, color: C.ink, margin: "12px 0 4px" }}>{t("admin.enterPasscode")}</h2>
      <p style={{ fontSize: 13, color: C.second, marginTop: 0 }}>{t("admin.passcode.help")}</p>
      <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t("admin.passcode")}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(28,38,64,.2)", marginBottom: 10 }} />
      {err && <div style={{ color: "#b3261e", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ width: "100%", background: C.gold, color: C.ink, padding: "13px", borderRadius: 10, fontSize: 15, opacity: busy ? 0.6 : 1 }}>{busy ? t("admin.checking2") : t("admin.unlock")}</button>
    </div>
  );
}

function Dashboard({ token, onLogout }) {
  const { t, ev } = useI18n();
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    setEvents(data || []);
    setLoading(false);
  }
  useEffect(() => { loadEvents(); }, []);

  if (loading) return <Spinner label={t("admin.loadingEvents")} />;
  if (selected) return <EventDetail event={selected} token={token} back={() => setSelected(null)} />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "inline-flex", padding: "5px 12px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{t("admin.super")}</div>
          <h2 className="serif" style={{ fontSize: 32, color: C.ink, margin: "8px 0 0" }}>{t("admin.yourEvents")}</h2>
        </div>
        <button onClick={onLogout} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "8px 14px", borderRadius: 999, fontSize: 13 }}>{t("admin.lock")}</button>
      </div>

      <CreateEvent token={token} onCreated={loadEvents} />

      {events.length === 0 ? (
        <Empty title={t("admin.noEvents.title")} sub={t("admin.noEvents.sub")} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginTop: 22 }}>
          {events.map((e) => (
            <button key={e.id} onClick={() => setSelected(e)} className="card"
              style={{ textAlign: "left", background: C.white, border: "1px solid rgba(28,38,64,.08)", borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{e.code}</div>
              <div className="serif" style={{ fontSize: 22, color: C.ink, margin: "4px 0 2px", lineHeight: 1.1 }}>{ev(e, "name")}</div>
              <div style={{ fontSize: 12, color: C.second }}>{[ev(e, "host"), ev(e, "event_date")].filter(Boolean).join(" · ")}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateEvent({ token, onCreated }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [date, setDate] = useState("");
  const [code, setCode] = useState("");
  const [threshold, setThreshold] = useState(45);
  const [nameEs, setNameEs] = useState("");
  const [hostEs, setHostEs] = useState("");
  const [dateEs, setDateEs] = useState("");
  const [translating, setTranslating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function autoCode(n) {
    const base = n.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 12);
    const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
    return base ? `${base}-${rand}` : `HALO-${rand}`;
  }

  async function autoTranslate() {
    if (!name.trim() && !host.trim() && !date.trim()) return;
    setTranslating(true); setErr("");
    try {
      const r = await fetch("/.netlify/functions/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, items: { name: name.trim(), host: host.trim(), date: date.trim() } }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Translation failed");
      const tr = j.translations || {};
      if (tr.name) setNameEs(tr.name);
      if (tr.host) setHostEs(tr.host);
      if (tr.date) setDateEs(tr.date);
    } catch (e) { setErr(e.message); } finally { setTranslating(false); }
  }

  async function create() {
    if (!name.trim()) { setErr(t("admin.nameRequired")); return; }
    setBusy(true); setErr("");
    const finalCode = (code.trim() || autoCode(name)).toUpperCase();
    try {
      const r = await fetch("/.netlify/functions/create-event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passcode: token, name: name.trim(), host: host.trim(), event_date: date.trim(),
          name_es: nameEs.trim(), host_es: hostEs.trim(), event_date_es: dateEs.trim(),
          code: finalCode, keep_threshold: Number(threshold),
        }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || t("admin.failedCreate")); }
      setName(""); setHost(""); setDate(""); setCode(""); setThreshold(45);
      setNameEs(""); setHostEs(""); setDateEs(""); setOpen(false);
      onCreated();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ marginTop: 18, background: C.gold, color: C.ink, padding: "12px 20px", borderRadius: 10, fontSize: 14 }}>{t("admin.createEvent")}</button>;
  }

  const field = { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(28,38,64,.2)", marginTop: 4 };
  const lab = { fontSize: 12, fontWeight: 600, color: C.ink };
  const hasEnglish = name.trim() || host.trim() || date.trim();

  return (
    <div style={{ marginTop: 18, background: C.white, border: "1px solid rgba(28,38,64,.1)", borderRadius: 16, padding: 22 }}>
      <h3 className="serif" style={{ fontSize: 22, color: C.ink, margin: "0 0 12px" }}>{t("admin.newEvent")}</h3>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lab}>{t("admin.eventName")} *</label>
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Resurrection Sunday Service" />
        </div>
        <div><label style={lab}>{t("admin.hostChurch")}</label><input style={field} value={host} onChange={(e) => setHost(e.target.value)} placeholder="Iglesia Cristiana Gracia y Gloria" /></div>
        <div><label style={lab}>{t("admin.dateDisplay")}</label><input style={field} value={date} onChange={(e) => setDate(e.target.value)} placeholder="March 31, 2026" /></div>
        <div><label style={lab}>{t("admin.customCode")}</label><input style={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("admin.autoFromName")} /></div>
        <div><label style={lab}>{t("admin.keepThreshold")} ({threshold})</label><input type="range" min="0" max="80" value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: "100%", marginTop: 10 }} /></div>
      </div>

      {/* Spanish version block */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(28,38,64,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{t("admin.spanishVersion")}</div>
          <button onClick={autoTranslate} disabled={translating || !hasEnglish}
            style={{ background: C.ink, color: C.bg, padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: translating || !hasEnglish ? 0.5 : 1 }}>
            {translating ? t("admin.translating") : t("admin.autoTranslate")}
          </button>
        </div>
        <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.reviewHint")}</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lab}>{t("admin.eventNameEs")}</label>
            <input style={field} value={nameEs} onChange={(e) => setNameEs(e.target.value)} placeholder="Servicio del Domingo de Resurrección" />
          </div>
          <div><label style={lab}>{t("admin.hostEs")}</label><input style={field} value={hostEs} onChange={(e) => setHostEs(e.target.value)} placeholder="" /></div>
          <div><label style={lab}>{t("admin.dateEs")}</label><input style={field} value={dateEs} onChange={(e) => setDateEs(e.target.value)} placeholder="31 de marzo de 2026" /></div>
        </div>
      </div>

      {err && <div style={{ color: "#b3261e", fontSize: 13, marginTop: 10 }}>{err}</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button onClick={create} disabled={busy} style={{ background: C.ink, color: C.bg, padding: "11px 18px", borderRadius: 10, fontSize: 14, opacity: busy ? 0.6 : 1 }}>{busy ? t("admin.creating") : t("admin.createGenerate")}</button>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "11px 18px", borderRadius: 10, fontSize: 14 }}>{t("admin.cancel")}</button>
      </div>
    </div>
  );
}

function EventDetail({ event, token, back }) {
  const { t, ev } = useI18n();
  const [photos, setPhotos] = useState([]);
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState("");
  const [filter, setFilter] = useState("all"); // all | kept
  const [version, setVersion] = useState("edited"); // edited | original
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  const eventUrl = `${window.location.origin}/e/${event.code}`;
  const liveUrl = `${window.location.origin}/live/${event.code}`;

  async function publish() {
    if (!confirm(t("admin.publishConfirm"))) return;
    setPublishing(true); setPublishMsg("");
    try {
      const r = await fetch("/.netlify/functions/publish-event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, eventId: event.id, origin: window.location.origin }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("admin.publishFailed"));
      setPublishMsg(`${t("admin.published")} · ${j.sent} ${j.sent === 1 ? t("admin.emailSent") : t("admin.emailsSent")}${j.failed ? `, ${j.failed} ${t("admin.failed")}` : ""}.`);
    } catch (e) { setPublishMsg(e.message); } finally { setPublishing(false); }
  }

  useEffect(() => {
    QRCode.toDataURL(eventUrl, { width: 320, margin: 1, color: { dark: "#1C2640", light: "#ffffff" } }).then(setQr);
    (async () => {
      const [{ data: ph }, { data: co }] = await Promise.all([
        supabase.from("photos").select("*").eq("event_id", event.id).order("created_at", { ascending: false }),
        supabase.from("contributors").select("*").eq("event_id", event.id),
      ]);
      const names = Object.fromEntries((co || []).map((c) => [c.id, c.name]));
      setContributors(co || []);
      setPhotos((ph || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, ownerName: names[p.contributor_id] || "Unknown" })));
      setLoading(false);
    })();
  }, [event.id]);

  function download(p) {
    const useEdited = version === "edited" && p.edited_url;
    const href = useEdited ? p.edited_url : p.url;
    const tag = useEdited ? "edited" : "orig";
    const a = document.createElement("a");
    a.href = href; a.download = `HALO_${event.code}_${p.ownerName.replace(/\s+/g, "-")}_${tag}_${p.id.slice(0, 6)}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function downloadAll() {
    const list = photos.filter((p) => filter === "all" || p.kept);
    for (const p of list) { download(p); await new Promise((r) => setTimeout(r, 350)); }
  }

  // --- selection helpers ---
  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function selectAllShown() {
    setSelected(new Set(shown.map((p) => p.id)));
  }

  // --- delete (one or many) via passcode-gated function ---
  async function deleteIds(ids, label) {
    if (ids.length === 0) return;
    if (!confirm(`${t("admin.deleteConfirm1")} ${ids.length} ${ids.length === 1 ? t("admin.photos").toLowerCase().replace(/s$/,"") : t("admin.photos").toLowerCase()}${label ? ` (${label})` : ""}? ${t("admin.deleteConfirm2")}`)) return;
    setDeleting(true);
    try {
      const r = await fetch("/.netlify/functions/delete-photos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, photoIds: ids }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("admin.deleteFailed"));
      const removed = new Set(ids);
      setPhotos((prev) => prev.filter((p) => !removed.has(p.id)));
      setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; });
    } catch (e) {
      alert(t("admin.couldNotDelete") + " " + e.message);
    } finally { setDeleting(false); }
  }
  const deleteOne = (id) => deleteIds([id]);
  const deleteSelected = () => deleteIds([...selected], "selected");
  const deleteAllRejected = () => deleteIds(photos.filter((p) => !p.kept).map((p) => p.id), "rejected");

  const kept = photos.filter((p) => p.kept);
  const rejected = photos.filter((p) => !p.kept);
  const editedCount = photos.filter((p) => p.edited_url).length;
  const shown = photos.filter((p) => filter === "all" || p.kept);

  return (
    <div>
      <button onClick={back} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 14px", borderRadius: 999, fontSize: 13 }}>{t("admin.allEvents")}</button>

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "center", marginTop: 16, background: C.white, border: "1px solid rgba(28,38,64,.1)", borderRadius: 16, padding: 22 }}>
        <div style={{ textAlign: "center" }}>
          {qr && <img src={qr} alt="Event QR code" style={{ width: 160, height: 160, borderRadius: 10 }} />}
          <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "center" }}>
            <a href={qr} download={`HALO-QR-${event.code}.png`} style={{ textDecoration: "none" }}>
              <button style={{ background: C.ink, color: C.bg, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.saveQR")}</button>
            </a>
            <button onClick={() => { navigator.clipboard?.writeText(eventUrl); alert(t("admin.linkCopied") + "\n" + eventUrl); }} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.copyLink")}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{event.code}</div>
          <h2 className="serif" style={{ fontSize: 30, color: C.ink, margin: "4px 0 2px" }}>{ev(event, "name")}</h2>
          <p style={{ color: C.second, margin: "0 0 14px" }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>
          <div style={{ display: "flex", gap: 12 }}>
            <Stat label={t("admin.photos")} value={photos.length} />
            <Stat label={t("admin.kept")} value={kept.length} gold />
            <Stat label={t("admin.contributors")} value={contributors.length} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <a href={liveUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button style={{ background: C.ink, color: C.bg, padding: "10px 16px", borderRadius: 10, fontSize: 13 }}>{t("admin.launchSlideshow")}</button>
            </a>
            <button onClick={publish} disabled={publishing} style={{ background: C.gold, color: C.ink, padding: "10px 16px", borderRadius: 10, fontSize: 13, opacity: publishing ? 0.6 : 1 }}>
              {publishing ? t("admin.publishing") : event.published_at ? t("admin.resendEmails") : t("admin.publishNotify")}
            </button>
            {publishMsg && <span style={{ fontSize: 12, color: C.second }}>{publishMsg}</span>}
          </div>
        </div>
      </div>

      {loading ? <Spinner label={t("admin.loadingCollection")} /> : photos.length === 0 ? (
        <Empty title={t("admin.nothing.title")} sub={t("admin.nothing.sub")} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 className="serif" style={{ fontSize: 24, color: C.ink, margin: 0 }}>{t("admin.collection")}</h3>
              <div style={{ fontSize: 12, color: C.second, marginTop: 2 }}>{editedCount} / {photos.length} {t("admin.autoEdited")}{rejected.length ? ` · ${rejected.length} ${t("admin.rejected")}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${C.second}`, overflow: "hidden" }}>
                <button onClick={() => setVersion("edited")} style={{ background: version === "edited" ? C.ink : "transparent", color: version === "edited" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.edited")}</button>
                <button onClick={() => setVersion("original")} style={{ background: version === "original" ? C.ink : "transparent", color: version === "original" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.original")}</button>
              </div>
              <button onClick={() => setFilter(filter === "all" ? "kept" : "all")} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{filter === "all" ? t("admin.keptOnly") : `${t("admin.all")} (${photos.length})`}</button>
              <button onClick={downloadAll} style={{ background: C.gold, color: C.ink, padding: "7px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.download")} {filter === "all" ? t("admin.all").toLowerCase() : t("admin.kept").toLowerCase()} ({version})</button>
              {!selectMode ? (
                <button onClick={() => setSelectMode(true)} style={{ background: "transparent", color: C.ink, border: `1px solid ${C.ink}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.select")}</button>
              ) : (
                <button onClick={exitSelect} style={{ background: C.ink, color: C.bg, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.done")}</button>
              )}
              {rejected.length > 0 && (
                <button onClick={deleteAllRejected} disabled={deleting} style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: deleting ? 0.6 : 1 }}>{t("admin.clearRejected")} {rejected.length} {t("admin.rejected")}</button>
              )}
            </div>
          </div>

          {/* selection action bar */}
          {selectMode && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, padding: "10px 14px", background: C.white, border: `1px solid rgba(28,38,64,.12)`, borderRadius: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{selected.size} {t("admin.selected")}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={selectAllShown} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.selectAllShown")}</button>
                <button onClick={() => setSelected(new Set())} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.clear")}</button>
                <button onClick={deleteSelected} disabled={deleting || selected.size === 0} style={{ background: "#b3261e", color: "#fff", padding: "6px 14px", borderRadius: 999, fontSize: 12, opacity: deleting || selected.size === 0 ? 0.5 : 1 }}>{deleting ? t("admin.deleting") : `${t("admin.delete")} ${selected.size}`}</button>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 14, marginTop: 16 }}>
            {shown.map((p) => {
              const isSel = selected.has(p.id);
              return (
                <div key={p.id} className="card" onClick={() => selectMode && toggleSelect(p.id)}
                  style={{ background: C.white, borderRadius: 12, overflow: "hidden", border: isSel ? `2px solid ${C.gold}` : "1px solid rgba(28,38,64,.08)", opacity: p.kept ? 1 : 0.6, cursor: selectMode ? "pointer" : "default" }}>
                  <div style={{ position: "relative" }}>
                    <img src={version === "edited" && p.edited_url ? p.edited_url : p.url} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
                    <span style={{ position: "absolute", top: 8, right: 8, background: p.kept ? C.gold : C.second, color: C.ink, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.quality}</span>
                    {version === "edited" && p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>EDITED</span>
                    )}
                    {version === "edited" && !p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(28,38,64,.7)", color: C.bg, fontSize: 10, padding: "2px 7px", borderRadius: 999 }}>processing…</span>
                    )}
                    {selectMode && (
                      <span style={{ position: "absolute", bottom: 8, left: 8, width: 22, height: 22, borderRadius: "50%", background: isSel ? C.gold : "rgba(255,255,255,.85)", border: `2px solid ${isSel ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.ink, fontSize: 13, fontWeight: 700 }}>{isSel ? "✓" : ""}</span>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{p.ownerName}</div>
                    <div style={{ fontSize: 11, color: C.second, marginBottom: 8 }}>focus {p.focus} · exp {p.exposure}</div>
                    {!selectMode && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => download(p)} style={{ flex: 1, background: C.ink, color: C.bg, padding: "7px", borderRadius: 8, fontSize: 12 }}>{t("admin.download")}</button>
                        <button onClick={() => deleteOne(p.id)} disabled={deleting} title="Delete" aria-label="Delete photo" style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 10px", borderRadius: 8, fontSize: 13, opacity: deleting ? 0.6 : 1 }}>🗑</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}
