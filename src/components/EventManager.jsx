// HALO — shared, auth-agnostic event-management UI.
//
// These components are the owner-scoped event tools: create an event, see its
// QR/guest link, review/approve photos, launch the slideshow, tag, crop,
// download, pin a "moment", edit settings, and delete. They are lifted from the
// super-admin page (src/pages/Admin.jsx) so the logic lives in ONE place.
//
// The one difference between the super-admin and a signed-in client is HOW a
// backend mutation is authorized: the admin sends the shared passcode, a client
// sends their Supabase JWT. So every mutation goes through an injected `api`
// object — `api.fn(name, body)` POSTs to /.netlify/functions/<name> with the
// right auth attached (see src/lib/authedFetch.js). The caller decides the
// strategy; these components never know about passcodes or tokens.
//
// Reads use the anon Supabase client directly (RLS scopes a signed-in client to
// their own rows; the super-admin service context sees all) — identical query
// code either way.
//
// INTEGRATION NOTE: Admin.jsx still carries its own inline copies of CreateEvent
// and EventDetail. On integration it can be refactored to import from here and
// pass a passcode-based api, deleting ~500 duplicated lines. It was left
// untouched here to avoid colliding with the auth/admin migration happening in
// parallel.
import React, { useEffect, useState, useRef, useMemo } from "react";
import QRCode from "qrcode";
import { supabase, publicUrl } from "../lib/supabase.js";
import { putToR2 } from "../lib/r2upload.js";
import { C } from "../lib/score.js";
import { Stat, Spinner, Empty } from "./UI.jsx";
import { downloadZip, downloadOne, saveBlob } from "../lib/zipDownload.js";
import { useI18n } from "../lib/i18n.jsx";
import { LOOKS, getLook } from "../lib/looks.js";
import { pickHighlights } from "../lib/highlight.js";

const HL_MUSIC = { wedding: "/music/elegant.mp3", quinceanera: "/music/celebration.mp3", church: "/music/worship.mp3", corporate: "/music/corporate.mp3", gala: "/music/elegant.mp3", other: "/music/cinematic.mp3" };
import { challengesFor, challengeText, parseChallengeLines, DEFAULT_CHALLENGES } from "../lib/challenges.js";
import { TvIcon, PhoneIcon, AlertIcon, PlayIcon, ChevronIcon, ExpandIcon, CloseIcon, PrintIcon, VideoIcon } from "./Icons.jsx";

const TAGS = ["worship", "baptism", "kids", "fellowship"];

// Small presentational helper used by both the create form and the settings panel.
export function Toggle({ on, onClick, title, help }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", background: on ? "rgba(255,184,107,.12)" : "rgba(255,255,255,.03)", border: `1px solid ${on ? C.gold : "rgba(255,255,255,.15)"}`, borderRadius: 12, padding: "11px 13px" }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, marginTop: 1, background: on ? C.gold : "transparent", border: `2px solid ${on ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.text, fontSize: 14, fontWeight: 700 }}>{on ? "✓" : ""}</span>
      <span>
        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: C.second, marginTop: 2 }}>{help}</span>
      </span>
    </button>
  );
}

// ---- Create event -----------------------------------------------------------
// `api.fn("create-event", {...})` is expected to resolve { event } on success.
// `api.fn("translate", {...})` resolves { translations: { name, host, date } }.
export function CreateEvent({ api, onCreated, renderTrigger }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [date, setDate] = useState("");
  const [code, setCode] = useState("");
  const [threshold, setThreshold] = useState(45);
  const [category, setCategory] = useState("");
  const [nameEs, setNameEs] = useState("");
  const [hostEs, setHostEs] = useState("");
  const [dateEs, setDateEs] = useState("");
  const [requireReview, setRequireReview] = useState(false);
  const [protectMinors, setProtectMinors] = useState(true);
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
      const j = await api.fn("translate", { items: { name: name.trim(), host: host.trim(), date: date.trim() } });
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
      const j = await api.fn("create-event", {
        name: name.trim(), host: host.trim(), event_date: date.trim(),
        name_es: nameEs.trim(), host_es: hostEs.trim(), event_date_es: dateEs.trim(),
        code: finalCode, keep_threshold: Number(threshold), category: category || null,
        moderation_mode: requireReview ? "review" : "off",
        protect_minors: protectMinors,
      });
      setName(""); setHost(""); setDate(""); setCode(""); setThreshold(45); setCategory("");
      setNameEs(""); setHostEs(""); setDateEs(""); setRequireReview(false); setProtectMinors(true); setOpen(false);
      onCreated(j.event);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!open) {
    if (renderTrigger) return renderTrigger(() => setOpen(true));
    return <button onClick={() => setOpen(true)} style={{ marginTop: 18, background: C.gold, color: C.ink, padding: "12px 20px", borderRadius: 10, fontSize: 14 }}>{t("admin.createEvent")}</button>;
  }

  const field = { width: "100%", padding: "11px 13px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", marginTop: 4, background: "rgba(255,255,255,.05)", color: C.text };
  const lab = { fontSize: 12, fontWeight: 600, color: C.text };
  const hasEnglish = name.trim() || host.trim() || date.trim();

  return (
    <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 22 }}>
      <h3 className="serif" style={{ fontSize: 22, color: C.text, margin: "0 0 12px" }}>{t("admin.newEvent")}</h3>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lab}>{t("admin.eventName")} *</label>
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Resurrection Sunday Service" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={lab}>{t("admin.category")}</label>
          <select style={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">—</option>
            {["wedding", "quinceanera", "church", "corporate", "gala", "other"].map((c) => <option key={c} value={c}>{t("cat." + c)}</option>)}
          </select>
        </div>
        <div><label style={lab}>{t("admin.hostChurch")}</label><input style={field} value={host} onChange={(e) => setHost(e.target.value)} placeholder="Iglesia Cristiana Gracia y Gloria" /></div>
        <div><label style={lab}>{t("admin.dateDisplay")}</label><input style={field} value={date} onChange={(e) => setDate(e.target.value)} placeholder="March 31, 2026" /></div>
        <div><label style={lab}>{t("admin.customCode")}</label><input style={field} value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("admin.autoFromName")} /></div>
        <div><label style={lab}>{t("admin.keepThreshold")} ({threshold})</label><input type="range" min="0" max="80" value={threshold} onChange={(e) => setThreshold(e.target.value)} style={{ width: "100%", marginTop: 10 }} /></div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>{t("admin.safety")}</div>
        <div style={{ display: "grid", gap: 10 }}>
          <Toggle on={requireReview} onClick={() => setRequireReview((v) => !v)} title={t("admin.requireReview")} help={t("admin.requireReview.help")} />
          <Toggle on={protectMinors} onClick={() => setProtectMinors((v) => !v)} title={t("admin.protectMinors")} help={t("admin.protectMinors.help")} />
        </div>
      </div>

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.spanishVersion")}</div>
          <button onClick={autoTranslate} disabled={translating || !hasEnglish}
            style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: translating || !hasEnglish ? 0.5 : 1 }}>
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
        <button onClick={create} disabled={busy} style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "11px 18px", borderRadius: 10, fontSize: 14, opacity: busy ? 0.6 : 1 }}>{busy ? t("admin.creating") : t("admin.createGenerate")}</button>
        <button onClick={() => setOpen(false)} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "11px 18px", borderRadius: 10, fontSize: 14 }}>{t("admin.cancel")}</button>
      </div>
    </div>
  );
}

// ---- Event detail / photo grid ----------------------------------------------
// Full management surface for one event. All reads use the anon client (RLS
// scopes a client to their own event); all mutations go through `api.fn(...)`.
export function EventDetail({ event, api, back }) {
  const { t, ev, lang } = useI18n();
  const [photos, setPhotos] = useState([]);
  const [contributors, setContributors] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState("");
  const [filter, setFilter] = useState("all");
  const [version, setVersion] = useState("edited");
  const [sessionFilter, setSessionFilter] = useState(event.current_session || "all");
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [cropping, setCropping] = useState(() => new Set());
  const [tagFilter, setTagFilter] = useState("all");
  const [tagging, setTagging] = useState(false);
  const [featuredId, setFeaturedId] = useState(event.featured_photo_id || null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(!!event.is_recurring);
  // Moderation. These existed only on the create form before, so a host had
  // no way to see or change them after the fact: "protect children" silently
  // defaulted ON for every event. Surfaced here so what you see is what's set.
  const [look, setLook] = useState(event.look || "midnight");
  const [chOn, setChOn] = useState(!(Array.isArray(event.challenges) && event.challenges.length === 0));
  const [chText, setChText] = useState(() => (challengesFor(event).length ? challengesFor(event) : DEFAULT_CHALLENGES).map((c) => challengeText(c, lang)).join("\n"));
  const [requireReview, setRequireReview] = useState(event.moderation_mode === "review");
  const [protectMinors, setProtectMinors] = useState(event.protect_minors !== false);
  const [currentSession, setCurrentSession] = useState(event.current_session || "");
  const [connectLabel, setConnectLabel] = useState(event.connect_label || "");
  const [connectLabelEs, setConnectLabelEs] = useState(event.connect_label_es || "");
  const [connectUrl, setConnectUrl] = useState(event.connect_url || "");
  const [category, setCategory] = useState(event.category || "");
  const [coverPath, setCoverPath] = useState(event.cover_path || "");
  const [coverBusy, setCoverBusy] = useState(false);
  // Smart framing focal point (0..1). Auto-detected at upload; host can nudge.
  const [coverFx, setCoverFx] = useState(Number.isFinite(event.cover_focus_x) ? event.cover_focus_x : 0.5);
  const [coverFy, setCoverFy] = useState(Number.isFinite(event.cover_focus_y) ? event.cover_focus_y : 0.5);
  const [focusBusy, setFocusBusy] = useState(false);
  // Smart framing, in the host's browser (MediaPipe, lazy-loaded):
  //   1) faces  2) people (heads at the top of the boxes)  3) upper third.
  // Stage 3 is a plain default, not a heuristic: an "attention" crop was tested
  // and chose candles over the couple. Upper-third keeps heads for most
  // photos of people and is harmless for venues and logos.
  async function autoFocus(path, file) {
    setFocusBusy(true);
    try {
      let fx = 0.5, fy = 0.33;
      if (file) {
        const { findFaceFocus } = await import("../lib/faceFocus.js");
        const f = await findFaceFocus(file);
        if (f) { fx = f.x; fy = f.y; }
      }
      setCoverFx(fx); setCoverFy(fy);
      await updateEvent({ cover_focus_x: fx, cover_focus_y: fy });
    } catch (e) { console.warn("cover framing", e); }
    finally { setFocusBusy(false); }
  }
  const [coverFile, setCoverFile] = useState(null); // kept so "Auto" can re-run face detection
  const [musicUrl, setMusicUrl] = useState(event.music_url || "");
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicRightsOk, setMusicRightsOk] = useState(!!event.music_rights_ack);
  const [libTracks, setLibTracks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  // "You're ready" checklist. Some items are detected (cover, first photo);
  // the rest are ticked when the host does the thing in this browser.
  const READY_KEY = `halo_ready_${event.id}`;
  const [readyDone, setReadyDone] = useState(() => { try { return JSON.parse(localStorage.getItem(READY_KEY) || "{}"); } catch { return {}; } });
  const [readyHidden, setReadyHidden] = useState(() => { try { return localStorage.getItem(READY_KEY + "_hide") === "1"; } catch { return false; } });
  function markReady(k) {
    setReadyDone((d) => { const n = { ...d, [k]: true }; try { localStorage.setItem(READY_KEY, JSON.stringify(n)); } catch {} return n; });
  }
  function hideReady() { setReadyHidden(true); try { localStorage.setItem(READY_KEY + "_hide", "1"); } catch {} }
  const [deletingEvent, setDeletingEvent] = useState(false);

  const eventUrl = `${window.location.origin}/e/${event.code}`;
  const liveUrl = `${window.location.origin}/live/${event.code}`;
  const today = () => new Date().toISOString().slice(0, 10);

  async function publish() {
    if (!confirm(t("admin.publishConfirm"))) return;
    setPublishing(true); setPublishMsg("");
    try {
      const j = await api.fn("publish-event", { eventId: event.id, origin: window.location.origin });
      setPublishMsg(`${t("admin.published")} · ${j.sent} ${j.sent === 1 ? t("admin.emailSent") : t("admin.emailsSent")}${j.failed ? `, ${j.failed} ${t("admin.failed")}` : ""}.`);
    } catch (e) { setPublishMsg(e.message); } finally { setPublishing(false); }
  }

  // Live-screen (TV) QR — lets the host open the slideshow on the TV device by
  // scanning instead of typing a URL. Plus a transient "copied" flag.
  const [tvQr, setTvQr] = useState("");
  const [tvCopied, setTvCopied] = useState(false);
  const [qrFull, setQrFull] = useState(false); // false | "join" | "tv": full-screen QR so guests (or a laptop camera) can scan easily
  const [qrBig, setQrBig] = useState("");        // hi-res copy of whichever QR is full screen
  useEffect(() => {
    if (!qrFull) { setQrBig(""); return; }
    const url = qrFull === "tv" ? liveUrl : eventUrl;
    QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: "#0a0410", light: "#ffffff" } }).then(setQrBig).catch(() => setQrBig(""));
    // Keep the phone screen awake while guests scan it.
    let lock = null;
    try { navigator.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); } catch {}
    return () => { try { lock?.release(); } catch {} };
  }, [qrFull]);
  useEffect(() => {
    if (!qrFull) return;
    const onKey = (e) => { if (e.key === "Escape") setQrFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrFull]);
  useEffect(() => {
    QRCode.toDataURL(liveUrl, { width: 320, margin: 1, color: { dark: "#16294C", light: "#ffffff" } }).then(setTvQr).catch(() => setTvQr(""));
  }, [liveUrl]);
  function copyTvLink() {
    navigator.clipboard?.writeText(liveUrl);
    setTvCopied(true); setTimeout(() => setTvCopied(false), 2000);
  }

  // Load everything, and reload when the event changes under us. The live
  // pulse below subscribes to realtime so the host sees uploads land without
  // refreshing; a slow poll is the safety net if the socket drops.
  const [lastChange, setLastChange] = useState(null); // Date of the latest upload/heart seen
  const [tick, setTick] = useState(0);                // re-render every 30 s so "2 min ago" stays honest
  async function loadAll() {
    const [{ data: ph }, { data: co }, { data: rx }] = await Promise.all([
      supabase.from("photos").select("*").eq("event_id", event.id).order("created_at", { ascending: false }),
      supabase.from("contributors").select("*").eq("event_id", event.id),
      supabase.from("reactions").select("photo_id,created_at").eq("event_id", event.id),
    ]);
    const names = Object.fromEntries((co || []).map((c) => [c.id, c.name]));
    const cmap = {};
    (rx || []).forEach((r) => { cmap[r.photo_id] = (cmap[r.photo_id] || 0) + 1; });
    setCounts(cmap);
    setContributors(co || []);
    setPhotos((ph || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, video_url: p.video_path ? publicUrl(p.video_path) : null, ownerName: names[p.contributor_id] || "Unknown" })));
    const latest = [...(ph || []).map((p) => p.created_at), ...(rx || []).map((r) => r.created_at)].filter(Boolean).sort().pop();
    if (latest) setLastChange(new Date(latest));
    setLoading(false);
  }
  useEffect(() => {
    QRCode.toDataURL(eventUrl, { width: 320, margin: 1, color: { dark: "#16294C", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
    loadAll();
    const channel = supabase
      .channel(`host-${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${event.id}` }, () => { setLastChange(new Date()); loadAll(); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: `event_id=eq.${event.id}` }, (p) => { setLastChange(new Date()); const id = p.new?.photo_id; if (id) setCounts((c) => ({ ...c, [id]: (c[id] || 0) + 1 })); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "contributors", filter: `event_id=eq.${event.id}` }, () => loadAll())
      .subscribe();
    const poll = setInterval(loadAll, 60000);
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); clearInterval(t); };
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    (async () => {
      const { data: lib } = await supabase.from("music_library").select("*").eq("active", true).order("created_at", { ascending: false });
      setLibTracks(lib || []);
    })();
  }, []);

  async function updateEvent(patch) {
    const j = await api.fn("update-event", { eventId: event.id, patch });
    return j.event;
  }

  async function pinMoment(id) { try { await updateEvent({ featured_photo_id: id }); setFeaturedId(id); } catch (e) { alert(e.message); } }
  async function clearMoment() { try { await updateEvent({ featured_photo_id: null }); setFeaturedId(null); } catch (e) { alert(e.message); } }
  async function pinTopMoment() {
    const pool = photos.filter((p) => p.kept && p.status === "approved");
    if (pool.length === 0) return;
    const top = pool.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))[0];
    pinMoment(top.id);
  }

  async function startNewSession() {
    if (!confirm(t("admin.newSessionConfirm"))) return;
    const d = today();
    try { await updateEvent({ is_recurring: true, current_session: d }); setIsRecurring(true); setCurrentSession(d); setSessionFilter(d); setSavedMsg(t("admin.saved")); }
    catch (e) { alert(e.message); }
  }

  async function saveSettings() {
    setSaving(true); setSavedMsg("");
    try {
      const patch = {
        look: look || null,
        challenges: !chOn ? [] : (() => {
          const lines = chText.split("\n").map((x) => x.trim()).filter(Boolean);
          const isDefault = lines.length === DEFAULT_CHALLENGES.length && lines.every((l, i) => l === DEFAULT_CHALLENGES[i].en || l === DEFAULT_CHALLENGES[i].es);
          return isDefault ? null : parseChallengeLines(chText);
        })(),
        moderation_mode: requireReview ? "review" : "off",
        protect_minors: !!protectMinors,
        is_recurring: isRecurring,
        current_session: isRecurring ? (currentSession || today()) : null,
        connect_label: connectLabel.trim() || null,
        connect_label_es: connectLabelEs.trim() || null,
        connect_url: connectUrl.trim() || null,
        category: category || null,
        cover_path: coverPath || null,
        cover_focus_x: coverPath ? coverFx : null,
        cover_focus_y: coverPath ? coverFy : null,
        music_url: musicUrl || null,
        music_rights_ack: !!musicRightsOk,
        music_rights_ack_at: musicRightsOk ? new Date().toISOString() : null,
      };
      const updated = await updateEvent(patch);
      setCurrentSession(updated.current_session || "");
      setSavedMsg(t("admin.saved"));
      markReady("settings");
    } catch (e) { setSavedMsg(e.message); } finally { setSaving(false); }
  }

  async function uploadCover(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setCoverBusy(true);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", {
        kind: "cover", filename: file.name, contentType: file.type || "image/jpeg",
      });
      await putToR2(uploadUrl, file, contentType);
      setCoverPath(path);
      await updateEvent({ cover_path: path });
      setCoverFile(file);
      await autoFocus(path, file); // find the faces so the crop never beheads anyone
    } catch (e) { alert(e.message); } finally { setCoverBusy(false); }
  }

  async function uploadMusic(file) {
    if (!file) return;
    setMusicBusy(true);
    try {
      const { uploadUrl, path, contentType } = await api.fn("sign-upload-admin", {
        kind: "music", filename: file.name, contentType: file.type || "audio/mpeg",
      });
      await putToR2(uploadUrl, file, contentType);
      setMusicUrl(path);
    } catch (e) { alert(e.message); } finally { setMusicBusy(false); }
  }

  async function deleteEvent() {
    const typed = window.prompt(`${t("admin.deleteEventConfirm")} ${event.code}`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== String(event.code).toUpperCase()) { alert(t("admin.deleteEventMismatch")); return; }
    setDeletingEvent(true);
    try {
      await api.fn("delete-event", { eventId: event.id });
      back();
    } catch (e) { alert(e.message); setDeletingEvent(false); }
  }

  function fileNameFor(p) {
    const who = (p.ownerName || "Guest").replace(/[^\p{L}\p{N}]+/gu, "-");
    if (p.video_url) {
      const ext = (String(p.video_path).match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1];
      return `HALO_${event.code}_${who}_video_${p.id.slice(0, 6)}.${ext}`;
    }
    const useEdited = version === "edited" && p.edited_url;
    const tag = useEdited ? "edited" : "orig";
    return `HALO_${event.code}_${who}_${tag}_${p.id.slice(0, 6)}.jpg`;
  }
  function hrefFor(p) { return p.video_url ? p.video_url : (version === "edited" && p.edited_url ? p.edited_url : p.url); }
  async function download(p) {
    try { await downloadOne(hrefFor(p), fileNameFor(p)); }
    catch { window.open(hrefFor(p), "_blank", "noopener"); } // fall back to opening it
  }
  // One ZIP with every photo currently shown (respects the kept/all and tag filters).
  const [zipping, setZipping] = useState(null); // null | { done, total }
  // Co-hosts: people the owner invited by email to help run this event.
  const [cohosts, setCohosts] = useState(null); // null = loading/not allowed
  const [cohostEmail, setCohostEmail] = useState("");
  const [cohostBusy, setCohostBusy] = useState(false);
  const [cohostErr, setCohostErr] = useState("");
  useEffect(() => {
    if (event._cohost) return;
    api.fn("manage-cohosts", { eventId: event.id }).then((r) => setCohosts(r.cohosts || [])).catch(() => setCohosts(null));
  }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function changeCohosts(body) {
    setCohostBusy(true); setCohostErr("");
    try {
      const r = await api.fn("manage-cohosts", { eventId: event.id, lang, ...body });
      setCohosts(r.cohosts || []);
      if (body.add) setCohostEmail("");
    } catch (e) { setCohostErr(e.message); } finally { setCohostBusy(false); }
  }

  // Highlight video: a ~60 s film of the best-loved photos, made in the browser.
  const [hlVertical, setHlVertical] = useState(true);
  const [hl, setHl] = useState(null); // null | { busy, sec, total } | { url, type, seconds } | { error }
  const hlAbort = useRef(null);
  // Every photo that can go in the film, best-loved first, plus HALO's own
  // picks. The host can keep HALO's picks or choose photos themselves.
  const hlPool = useMemo(() => pickHighlights(photos, counts, 10000)
    .sort((a, b) => ((counts[b.id] || 0) - (counts[a.id] || 0)) || ((b.quality || 0) - (a.quality || 0))), [photos, counts]);
  const hlAuto = useMemo(() => pickHighlights(photos, counts, 20), [photos, counts]);
  const [hlPick, setHlPick] = useState(null);     // null = HALO's picks, else Set of photo ids
  const [hlChoosing, setHlChoosing] = useState(false);
  const hlSelected = hlPick ? hlPool.filter((p) => hlPick.has(p.id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) : hlAuto;
  function toggleHlPhoto(id) {
    setHlPick((cur) => {
      const next = new Set(cur || hlAuto.map((p) => p.id));
      if (next.has(id)) next.delete(id); else if (next.size < 40) next.add(id);
      return next;
    });
  }
  async function makeHighlightVideo() {
    const { makeHighlight } = await import("../lib/highlight.js");
    const chosen = hlSelected;
    if (chosen.length < 3) { setHl({ error: t("hl.needMore") }); return; }
    const look = getLook(event.look || "midnight");
    const music = event.music_url === "none" ? null
      : event.music_url ? ((event.music_url.startsWith("/") || event.music_url.startsWith("http")) ? event.music_url : publicUrl(event.music_url))
      : (HL_MUSIC[event.category] || "/music/cinematic.mp3");
    const ctrl = new AbortController(); hlAbort.current = ctrl;
    setHl({ busy: true, sec: 0, total: 60 });
    try {
      const r = await makeHighlight({
        photos: chosen.map((p) => ({ url: p.edited_url || p.url })),
        eyebrow: t("hl.eyebrow"),
        title: ev(event, "name"),
        subtitle: [ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · "),
        outroTitle: t("hl.outroTitle"),
        outroSub: t("hl.outroSub").replace("{n}", contributors.length).replace("{p}", photos.length),
        musicUrl: music, vertical: hlVertical, gold: look.gold, bg: look.light ? "#17150f" : look.ink,
        watermark: "HALO", signal: ctrl.signal,
        onProgress: (sec, total) => setHl({ busy: true, sec, total }),
      });
      setHl({ url: URL.createObjectURL(r.blob), type: r.type, seconds: r.seconds });
    } catch (e) {
      setHl(e.message === "cancelled" ? null : { error: e.message === "unsupported" ? t("hl.unsupported") : t("hl.failed") });
    }
  }

  // Guestbook messages (host sees all, including hidden ones).
  const [wishes, setWishes] = useState([]);
  const loadWishes = async () => {
    try { const r = await api.fn("manage-wishes", { eventId: event.id }); setWishes(r.wishes || []); } catch { /* table not created yet */ }
  };
  useEffect(() => { loadWishes(); const tmr = setInterval(loadWishes, 45000); return () => clearInterval(tmr); }, [event.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function setWishStatus(id, status) {
    setWishes((cur) => cur.map((w) => (w.id === id ? { ...w, status } : w)));
    try { await api.fn("manage-wishes", { eventId: event.id, wishIds: [id], status }); } catch (e) { alert(e.message); loadWishes(); }
  }
  function wishesText() {
    const shown = wishes.filter((w) => w.status === "approved");
    return `${ev(event, "name")} — ${t("admin.wishes")}\n\n` + shown.slice().reverse().map((w) => `"${w.message}"\n  — ${w.name || (lang === "es" ? "Un invitado" : "A guest")}\n`).join("\n");
  }
  async function downloadAll() {
    if (zipping || !shown.length) return;
    setZipping({ done: 0, total: shown.length });
    try {
      const items = shown.map((p) => ({ url: hrefFor(p), name: fileNameFor(p) }));
      const slug = String(event.name || event.code).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      const extras = wishes.some((w) => w.status === "approved") ? [{ name: "guestbook-messages.txt", text: wishesText() }] : [];
      const { missing } = await downloadZip(items, `HALO_${slug || event.code}_${items.length}-photos.zip`, (done, total) => setZipping({ done, total }), extras);
      if (missing.length) alert(t("admin.zipMissing").replace("{n}", missing.length));
    } catch (e) { alert(t("admin.zipFailed")); }
    finally { setZipping(null); }
  }

  function toggleSelect(id) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function exitSelect() { setSelectMode(false); setSelected(new Set()); }
  function selectAllShown() { setSelected(new Set(shown.map((p) => p.id))); }

  async function moderate(ids, status) {
    if (!ids || ids.length === 0) return;
    setModerating(true);
    try {
      await api.fn("moderate-photos", { photoIds: ids, status });
      const set = new Set(ids);
      setPhotos((prev) => prev.map((p) => (set.has(p.id) ? { ...p, status } : p)));
    } catch (e) { alert(e.message); } finally { setModerating(false); }
  }

  async function makeCrops(p) {
    setCropping((prev) => new Set(prev).add(p.id));
    try {
      let crops = p.crops;
      if (!crops || Object.keys(crops).length < 4) {
        const j = await api.fn("crop-photo", { photoId: p.id });
        crops = j.crops;
        setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, crops } : x)));
      }
      for (const key of ["1x1", "4x5", "9x16", "16x9"]) {
        const path = crops[key];
        if (!path) continue;
        const a = document.createElement("a");
        a.href = publicUrl(path); a.download = `HALO_${event.code}_${p.ownerName.replace(/\s+/g, "-")}_${key}.jpg`;
        document.body.appendChild(a); a.click(); a.remove();
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (e) { alert(e.message); } finally {
      setCropping((prev) => { const n = new Set(prev); n.delete(p.id); return n; });
    }
  }

  async function tagPhotos(ids, tag, op) {
    if (!ids || ids.length === 0) return;
    setTagging(true);
    try {
      await api.fn("tag-photos", { photoIds: ids, tag, op });
      const set = new Set(ids);
      setPhotos((prev) => prev.map((p) => {
        if (!set.has(p.id)) return p;
        const cur = new Set(p.tags || []);
        op === "add" ? cur.add(tag) : cur.delete(tag);
        return { ...p, tags: Array.from(cur) };
      }));
    } catch (e) { alert(e.message); } finally { setTagging(false); }
  }

  async function deleteIds(ids, label) {
    if (ids.length === 0) return;
    if (!confirm(`${t("admin.deleteConfirm1")} ${ids.length} ${ids.length === 1 ? t("admin.photos").toLowerCase().replace(/s$/, "") : t("admin.photos").toLowerCase()}${label ? ` (${label})` : ""}? ${t("admin.deleteConfirm2")}`)) return;
    setDeleting(true);
    try {
      await api.fn("delete-photos", { photoIds: ids });
      const removed = new Set(ids);
      setPhotos((prev) => prev.filter((p) => !removed.has(p.id)));
      setSelected((prev) => { const n = new Set(prev); ids.forEach((i) => n.delete(i)); return n; });
    } catch (e) { alert(t("admin.couldNotDelete") + " " + e.message); } finally { setDeleting(false); }
  }
  const deleteOne = (id) => deleteIds([id]);
  const deleteSelected = () => deleteIds([...selected], "selected");
  const deleteAllRejected = () => deleteIds(photos.filter((p) => !p.kept).map((p) => p.id), "rejected");

  const kept = photos.filter((p) => p.kept);
  const rejected = photos.filter((p) => !p.kept);
  // Plain-language read of the two sub-scores, instead of "focus 21 · exp 93".
  function qualityLine(p) {
    const f = Number(p.focus), e = Number(p.exposure);
    const sharp = !Number.isFinite(f) ? null : f >= 70 ? t("q.sharp") : f >= 40 ? t("q.soft") : t("q.blurry");
    const lit = !Number.isFinite(e) ? null : e >= 70 ? t("q.wellLit") : e >= 40 ? t("q.dim") : t("q.poorLight");
    return [sharp, lit].filter(Boolean).join(" · ") || "";
  }
  const pending = photos.filter((p) => p.status === "pending");
  const dupCount = photos.filter((p) => p.is_burst_dup).length;
  const editedCount = photos.filter((p) => p.edited_url).length;
  const sessions = Array.from(new Set(photos.map((p) => p.session_label).filter(Boolean)));
  const shown = photos.filter((p) => (filter === "all" || p.kept) && (sessionFilter === "all" || (p.session_label || "") === sessionFilter) && (tagFilter === "all" || (p.tags || []).includes(tagFilter)));
  const featured = photos.find((p) => p.id === featuredId);

  const sfield = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", marginTop: 4, background: "rgba(255,255,255,.05)", color: C.text };
  const slab = { fontSize: 12, fontWeight: 600, color: C.text };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={back} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 14px", borderRadius: 999, fontSize: 13 }}>{t("admin.allEvents")}</button>
        <button onClick={() => setSettingsOpen((v) => !v)} style={{ background: settingsOpen ? C.gold : "transparent", color: settingsOpen ? C.ink : C.text, border: `1px solid ${settingsOpen ? C.gold : C.line2}`, padding: "7px 14px", borderRadius: 999, fontSize: 13 }}>{t("admin.settings")}</button>
      </div>

      {/* ---- YOU'RE READY CHECKLIST ----
          Hosts panic the morning of. Five things, each with a button that does
          it. Detected where we can; otherwise ticked when they do it here. */}
      {(() => {
        const items = [
          { k: "cover", done: !!coverPath, label: t("ready.cover"), action: () => setSettingsOpen(true) },
          { k: "settings", done: !!readyDone.settings, label: t("ready.settings"), action: () => setSettingsOpen(true) },
          { k: "qr", done: !!readyDone.qr, label: t("ready.qr"), action: async () => { markReady("qr"); const { openTableCard } = await import("../lib/tableCard.js"); openTableCard({ eventName: ev(event, "name"), subline: [ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · "), eventUrl, code: event.code }); } },
          { k: "photo", done: photos.length > 0, label: t("ready.photo"), action: () => window.open(eventUrl, "_blank", "noreferrer") },
          { k: "live", done: !!readyDone.live, label: t("ready.live"), action: () => { markReady("live"); window.open(liveUrl, "_blank", "noreferrer"); } },
        ];
        const doneCount = items.filter((i) => i.done).length;
        const all = doneCount === items.length;
        if (readyHidden && all) return null;
        return (
          <div style={{ marginTop: 16, background: all ? "rgba(255,184,107,.08)" : C.card, border: `1px solid ${all ? C.gold : "rgba(255,255,255,.12)"}`, borderRadius: 16, padding: "14px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{all ? t("ready.allDone") : t("ready.title")}</div>
                <div style={{ fontSize: 12, color: C.second, marginTop: 2 }}>{all ? t("ready.allDone.sub") : `${doneCount} / ${items.length} · ${t("ready.sub")}`}</div>
              </div>
              {all && <button onClick={hideReady} style={{ background: "transparent", color: C.second, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("ready.dismiss")}</button>}
            </div>
            {!all && (
              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "grid", gap: 6 }}>
                {items.map((i) => (
                  <li key={i.k} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span aria-hidden="true" style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 6, background: i.done ? C.gold : "transparent", border: `2px solid ${i.done ? C.gold : C.second}`, color: C.ink, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800 }}>{i.done ? "✓" : ""}</span>
                    <span style={{ color: i.done ? C.second : C.text, textDecoration: i.done ? "line-through" : "none", flex: 1 }}>{i.label}</span>
                    {!i.done && <button onClick={i.action} style={{ background: "transparent", color: C.gold, border: `1px solid ${C.gold}`, padding: "4px 10px", borderRadius: 999, fontSize: 12 }}>{t("ready.go")}</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      {/* ---- LIVE PULSE ---- what's happening right now, no refresh needed */}
      {(() => {
        void tick;
        const now = Date.now();
        const recent = photos.filter((p) => now - new Date(p.created_at).getTime() < 5 * 60 * 1000).length;
        const heartsTotal = Object.values(counts).reduce((a, b) => a + b, 0);
        const ago = lastChange ? Math.max(0, Math.round((now - lastChange.getTime()) / 60000)) : null;
        const live = ago != null && ago < 5;
        return (
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: C.card, border: `1px solid ${live ? C.gold : "rgba(255,255,255,.12)"}`, borderRadius: 16, padding: "12px 16px" }}>
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: "50%", background: live ? "#4ade80" : C.second, boxShadow: live ? "0 0 0 4px rgba(74,222,128,.18)" : "none", animation: live ? "pulseDot 1.6s ease-in-out infinite" : "none", flexShrink: 0 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              {live ? t("pulse.live") : t("pulse.quiet")}
              <span style={{ fontWeight: 400, color: C.second }}>
                {" · "}{recent} {t("pulse.recent")}{" · "}{contributors.length} {t("pulse.guests")}{" · "}{heartsTotal} {t("pulse.hearts")}{pending.length ? ` · ${pending.length} ${t("pulse.waiting")}` : ""}
              </span>
            </div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.second }}>
              {ago == null ? t("pulse.nothingYet") : ago === 0 ? t("pulse.justNow") : `${t("pulse.last")} ${ago} ${ago === 1 ? t("pulse.minute") : t("pulse.minutes")}`}
            </div>
            <style>{`@keyframes pulseDot { 0%,100% { transform: scale(1) } 50% { transform: scale(1.35) } }`}</style>
          </div>
        );
      })()}

      <div id="halo-qr-box" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "center", marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 22 }}>
        <div style={{ textAlign: "center" }}>
          {qr && (
            <button type="button" onClick={() => setQrFull("join")} aria-label={t("qr.showBig")} style={{ padding: 0, border: "none", background: "transparent", cursor: "zoom-in", display: "block", margin: "0 auto" }}>
              <img src={qr} alt="Event QR code" style={{ width: 160, height: 160, borderRadius: 10, maxWidth: "100%", display: "block" }} />
            </button>
          )}
          {qr && (
            <button type="button" onClick={() => setQrFull("join")} style={{ marginTop: 8, width: "100%", background: C.gold, color: C.ink, border: "none", padding: "9px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <ExpandIcon /> {t("qr.showBig")}
            </button>
          )}
          <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
            {qr && (
              <a href={qr} download={`HALO-QR-${event.code}.png`} onClick={() => markReady("qr")} style={{ textDecoration: "none" }}>
                <button style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.saveQR")}</button>
              </a>
            )}
            <button onClick={async () => { markReady("qr"); const { openTableCard } = await import("../lib/tableCard.js"); openTableCard({ eventName: ev(event, "name"), subline: [ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · "), eventUrl, code: event.code }); }}
              title={t("admin.tableCard.help")} style={{ background: C.gold, color: C.ink, border: "none", padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}><PrintIcon /> {t("admin.tableCard")}</button>
            <button onClick={() => { navigator.clipboard?.writeText(eventUrl); markReady("qr"); alert(t("admin.linkCopied") + "\n" + eventUrl); }} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.copyLink")}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{event.code}{isRecurring ? ` · ${t("admin.session")} ${currentSession || today()}` : ""}</div>
          <h2 className="serif" style={{ fontSize: 30, color: C.text, margin: "4px 0 2px" }}>{ev(event, "name")}</h2>
          <p style={{ color: C.second, margin: "0 0 14px" }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Stat label={t("admin.photos")} value={photos.length} />
            <Stat label={t("admin.kept")} value={kept.length} gold />
            <Stat label={t("admin.contributors")} value={contributors.length} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <a href={liveUrl} target="_blank" rel="noreferrer" onClick={() => markReady("live")} style={{ textDecoration: "none" }}>
              <button style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "10px 16px", borderRadius: 10, fontSize: 13 }}>{t("admin.launchSlideshow")}</button>
            </a>
            <a href={eventUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "10px 16px", borderRadius: 10, fontSize: 13 }}>{t("admin.viewGallery")}</button>
            </a>
            <button onClick={publish} disabled={publishing} style={{ background: C.gold, color: C.ink, padding: "10px 16px", borderRadius: 10, fontSize: 13, opacity: publishing ? 0.6 : 1 }}>
              {publishing ? t("admin.publishing") : event.published_at ? t("admin.resendEmails") : t("admin.publishNotify")}
            </button>
            {publishMsg && <span style={{ fontSize: 12, color: C.second }}>{publishMsg}</span>}
          </div>
          <p style={{ fontSize: 11.5, color: C.second, margin: "8px 0 0", lineHeight: 1.45 }}>{t("admin.actionsHelp")}</p>
        </div>
      </div>

      {qrFull && (qrBig || (qrFull === "tv" ? tvQr : qr)) && (
        <div onClick={() => setQrFull(false)} role="dialog" aria-label={t("tv.qrFull")}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#ffffff", display: "grid", placeItems: "center", cursor: "zoom-out" }}>
          <button onClick={() => setQrFull(false)} aria-label={t("tv.qrClose")}
            style={{ position: "absolute", top: 16, right: 16, background: "#f1f1f4", color: "#16294C", border: "none", borderRadius: 999, width: 44, height: 44, display: "grid", placeItems: "center" }}><CloseIcon /></button>
          <div style={{ textAlign: "center" }}>
            {qrFull === "join" && (
              <div style={{ color: "#0a0410", fontSize: "clamp(20px, 4.4vmin, 44px)", fontWeight: 800, lineHeight: 1.15, padding: "0 16px 2.4vmin" }}>{t("qr.scanTitle")}</div>
            )}
            <img src={qrBig || (qrFull === "tv" ? tvQr : qr)} alt="QR code" style={{ width: "min(92vw, 78vh, 1000px)", height: "min(92vw, 78vh, 1000px)", display: "block", margin: "0 auto", imageRendering: "pixelated" }} />
            <div style={{ color: "#16294C", fontSize: "clamp(14px, 2.6vmin, 24px)", fontWeight: 700, marginTop: "2vmin", padding: "0 16px" }}>
              {qrFull === "join" ? ev(event, "name") : t("tv.qrFullHint")}
            </div>
            {qrFull === "join" && <div style={{ color: "#5b6070", fontSize: "clamp(12px, 2vmin, 18px)", marginTop: 6 }}>{t("qr.tapClose")}</div>}
          </div>
        </div>
      )}

      {/* ---- CO-HOSTS ---- */}
      {event._cohost ? (
        <div style={{ marginTop: 16, background: "rgba(255,184,107,.08)", border: "1px solid rgba(255,184,107,.3)", borderRadius: 14, padding: "10px 14px", fontSize: 13, color: C.text }}>{t("cohost.youAre")}</div>
      ) : cohosts && (
        <details style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "14px 18px" }}>
          <summary style={{ cursor: "pointer", fontWeight: 800, color: C.text, fontSize: 15 }}>{t("cohost.title")} ({cohosts.length})</summary>
          <p style={{ fontSize: 12, color: C.second, margin: "6px 0 12px" }}>{t("cohost.help")}</p>
          <form onSubmit={(e) => { e.preventDefault(); if (cohostEmail.trim()) changeCohosts({ add: cohostEmail.trim() }); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input type="email" value={cohostEmail} onChange={(e) => setCohostEmail(e.target.value)} placeholder={t("cohost.placeholder")} autoComplete="off"
              style={{ flex: "1 1 220px", minWidth: 0, background: "rgba(255,255,255,.04)", color: C.text, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "10px 12px", fontSize: 14 }} />
            <button type="submit" disabled={cohostBusy || !cohostEmail.trim()} style={{ background: C.gold, color: C.ink, border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, opacity: cohostBusy || !cohostEmail.trim() ? 0.6 : 1 }}>{cohostBusy ? t("cohost.adding") : t("cohost.add")}</button>
          </form>
          {cohostErr && <div style={{ color: C.pink, fontSize: 12, marginTop: 6 }}>{cohostErr}</div>}
          {cohosts.length > 0 && (
            <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
              {cohosts.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line2}`, borderRadius: 10, padding: "8px 12px" }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis" }}>{c.email}</span>
                  <button type="button" disabled={cohostBusy} onClick={() => changeCohosts({ remove: c.id })} style={{ background: "transparent", color: C.second, border: `1px solid ${C.line2}`, padding: "5px 10px", borderRadius: 999, fontSize: 12 }}>{t("cohost.remove")}</button>
                </div>
              ))}
            </div>
          )}
        </details>
      )}

      {/* ---- HIGHLIGHT VIDEO ---- */}
      <div style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: C.gold, display: "inline-flex" }}><VideoIcon size={20} /></span>
          <div style={{ fontWeight: 800, color: C.text, fontSize: 15 }}>{t("hl.title")}</div>
        </div>
        <p style={{ fontSize: 12, color: C.second, margin: "6px 0 12px", lineHeight: 1.5 }}>{t("hl.help")}</p>
        {hl && hl.url ? (
          <div>
            <video src={hl.url} controls playsInline style={{ width: "100%", maxWidth: hlVertical ? 260 : 520, maxHeight: 460, borderRadius: 12, background: "#000", display: "block" }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <a href={hl.url} download={`HALO_${event.code}_highlight.${hl.type === "video/mp4" ? "mp4" : "webm"}`} style={{ textDecoration: "none" }}>
                <button type="button" style={{ background: C.gold, color: C.onInk, border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700 }}>{t("hl.download")}</button>
              </a>
              <button type="button" onClick={() => { URL.revokeObjectURL(hl.url); setHl(null); }} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "10px 16px", borderRadius: 10, fontSize: 13 }}>{t("hl.again")}</button>
            </div>
            {hl.type !== "video/mp4" && <p style={{ fontSize: 11.5, color: C.second, margin: "8px 0 0" }}>{t("hl.webmNote")}</p>}
          </div>
        ) : hl && hl.busy ? (
          <div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>{t("hl.making").replace("{s}", hl.sec).replace("{t}", hl.total)}</div>
            <div style={{ height: 8, background: "rgba(255,255,255,.08)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (hl.sec / Math.max(1, hl.total)) * 100)}%`, height: "100%", background: C.gold, transition: "width .9s linear" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 10 }}>
              <span style={{ fontSize: 11.5, color: C.second }}>{t("hl.keepOpen")}</span>
              <button type="button" onClick={() => hlAbort.current && hlAbort.current.abort()} style={{ background: "transparent", color: C.second, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("ch.cancel")}</button>
            </div>
          </div>
        ) : (
          hlPool.length < 3 ? (
            <div style={{ background: "rgba(255,255,255,.04)", border: `1px dashed ${C.line2}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                {hlPool.length === 1 ? t("hl.notEnough1") : t("hl.notEnough").replace("{n}", hlPool.length)}
              </div>
              <div style={{ fontSize: 12, color: C.second, lineHeight: 1.5, marginTop: 4 }}>{t("hl.autoExplain")}</div>
              <a href={`/e/${event.code}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 10, background: C.gold, color: C.onInk, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: "none" }}>
                {t("hl.addPhotos")}
              </a>
            </div>
          ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, color: C.text }}>
                {hlPick ? t("hl.youChose").replace("{n}", hlSelected.length) : t("hl.haloPicks").replace("{n}", hlAuto.length)}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {hlPick && <button type="button" onClick={() => { setHlPick(null); setHlChoosing(false); }} style={{ background: "transparent", color: C.second, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("hl.useHalo")}</button>}
                <button type="button" onClick={() => setHlChoosing((v) => !v)} aria-expanded={hlChoosing} style={{ background: "transparent", color: C.gold, border: `1px solid ${C.gold}`, padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>
                  {hlChoosing ? t("hl.doneChoosing") : t("hl.choose")}
                </button>
              </span>
            </div>
            {hlChoosing && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11.5, color: C.second, marginBottom: 8 }}>{t("hl.chooseHelp")}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 6, maxHeight: 340, overflowY: "auto", paddingRight: 2 }}>
                  {hlPool.map((p) => {
                    const on = hlPick ? hlPick.has(p.id) : hlAuto.some((a) => a.id === p.id);
                    return (
                      <button type="button" key={p.id} onClick={() => toggleHlPhoto(p.id)} aria-pressed={on}
                        style={{ position: "relative", aspectRatio: "1 / 1", padding: 0, border: on ? `2px solid ${C.gold}` : "2px solid transparent", borderRadius: 10, overflow: "hidden", background: "#111", cursor: "pointer" }}>
                        <img src={p.edited_url || p.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: on ? 1 : 0.45 }} />
                        {on && (
                          <span style={{ position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: "50%", background: C.gold, color: C.onInk, display: "grid", placeItems: "center" }}>
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
                          </span>
                        )}
                        {(counts[p.id] || 0) > 0 && (
                          <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.6)", borderRadius: 999, padding: "1px 6px" }}>{counts[p.id]}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${C.line2}`, overflow: "hidden" }}>
                <button type="button" onClick={() => setHlVertical(true)} aria-pressed={hlVertical} style={{ background: hlVertical ? C.gold : "transparent", color: hlVertical ? C.onInk : C.text, border: "none", borderRadius: 0, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{t("hl.vertical")}</button>
                <button type="button" onClick={() => setHlVertical(false)} aria-pressed={!hlVertical} style={{ background: !hlVertical ? C.gold : "transparent", color: !hlVertical ? C.onInk : C.text, border: "none", borderRadius: 0, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{t("hl.wide")}</button>
              </div>
              <button type="button" onClick={makeHighlightVideo} disabled={hlSelected.length < 3} style={{ background: C.gold, color: C.onInk, border: "none", padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 700, opacity: hlSelected.length < 3 ? 0.5 : 1 }}>{t("hl.make")}</button>
              {hlSelected.length < 3 && <span style={{ fontSize: 12, color: C.pink, flexBasis: "100%" }}>{t("hl.pickThree")}</span>}
              {hl && hl.error && <span style={{ fontSize: 12, color: C.pink, flexBasis: "100%" }}>{hl.error}</span>}
            </div>
          </div>
          )
        )}
      </div>

      {/* ---- GUESTBOOK MESSAGES ---- */}
      <details style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: "14px 18px" }}>
        <summary style={{ cursor: "pointer", fontWeight: 800, color: C.text, fontSize: 15 }}>{t("admin.wishes")} ({wishes.filter((w) => w.status === "approved").length})</summary>
        <p style={{ fontSize: 12, color: C.second, margin: "6px 0 12px" }}>{t("admin.wishes.help")}</p>
        {wishes.length === 0 ? (
          <div style={{ fontSize: 13, color: C.second }}>{t("admin.wishesNone")}</div>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
              {wishes.map((w) => (
                <div key={w.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(255,255,255,.03)", border: `1px solid ${C.line2}`, borderRadius: 10, padding: "10px 12px", opacity: w.status === "hidden" ? 0.5 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: C.text, overflowWrap: "anywhere" }}>{w.message}</div>
                    <div style={{ fontSize: 11, color: C.second, marginTop: 3 }}>{w.name || "—"}{w.status === "hidden" ? ` · ${t("admin.hidden")}` : w.status === "pending" ? ` · ${t("grid.pending")}` : ""}</div>
                  </div>
                  <button type="button" onClick={() => setWishStatus(w.id, w.status === "approved" ? "hidden" : "approved")}
                    style={{ flex: "0 0 auto", background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>
                    {w.status === "approved" ? t("admin.hide") : t("admin.show")}
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => saveBlob(new Blob([wishesText()], { type: "text/plain;charset=utf-8" }), `HALO_${event.code}_guestbook.txt`)}
              style={{ marginTop: 10, background: "transparent", color: C.gold, border: `1px solid ${C.gold}`, padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{t("admin.wishesDownload")}</button>
          </>
        )}
      </details>

      {/* ---- SHOW ON TV / PROJECTOR ----
          The live slideshow is the event-day "wow", but a host at a venue has
          to get a browser URL onto a TV. Make that a first-class, plain-language
          card: one big action, a QR so nobody types a URL, and three steps that
          cover the real ways people connect. */}
      <div style={{ marginTop: 16, background: C.card, border: `1px solid ${C.gold}`, borderRadius: 16, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: C.gold, marginTop: 2 }}><TvIcon size={30} /></div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{t("tv.title")}</div>
            <p style={{ fontSize: 13, color: C.second, margin: "4px 0 0", lineHeight: 1.5 }}>{t("tv.sub")}</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <a href={liveUrl} target="_blank" rel="noreferrer" onClick={() => markReady("live")} style={{ textDecoration: "none" }}>
            <button style={{ background: C.gold, color: C.ink, padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 }}><PlayIcon /> {t("tv.open")}</button>
          </a>
          <button onClick={copyTvLink} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "12px 16px", borderRadius: 10, fontSize: 13 }}>
            {tvCopied ? t("tv.copied") : t("tv.copy")}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 18, marginTop: 18, alignItems: "start" }}>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
            {[["tv.step1.t", "tv.step1.d"], ["tv.step2.t", "tv.step2.d"], ["tv.step3.t", "tv.step3.d"]].map(([tk, dk], i) => (
              <li key={tk} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: C.gold, color: C.ink, display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
                <span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: C.text }}>{t(tk)}</span>
                  <span style={{ display: "block", fontSize: 12.5, color: C.second, marginTop: 2, lineHeight: 1.5 }}>{t(dk)}</span>
                </span>
              </li>
            ))}
          </ol>
          {tvQr && (
            <div style={{ textAlign: "center" }}>
              <button type="button" onClick={() => setQrFull("tv")} aria-label={t("tv.qrFull")} style={{ padding: 0, border: "none", background: "transparent", cursor: "zoom-in", display: "block" }}>
                <img src={tvQr} alt="Live screen QR code" style={{ width: 132, height: 132, borderRadius: 10, display: "block" }} />
              </button>
              <div style={{ fontSize: 10.5, color: C.second, marginTop: 6, letterSpacing: .5, textTransform: "uppercase" }}>{t("tv.open")}</div>
              <button onClick={() => setQrFull("tv")} style={{ marginTop: 8, background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <ExpandIcon /> {t("tv.qrFull")}
              </button>
            </div>
          )}
        </div>

        <p style={{ fontSize: 12.5, color: C.gold, margin: "14px 0 0", lineHeight: 1.5 }}>{t("tv.tip")}</p>

        {/* No laptop? Phone paths. Collapsed by default so the card stays
            short for the common case; each <details> is its own step list. */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line2}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{t("tv.phone.t")}</div>
          <p style={{ fontSize: 12.5, color: C.second, margin: "4px 0 10px", lineHeight: 1.5 }}>{t("tv.phone.d")}</p>

          {[["tv.ios.t", ["tv.ios.1", "tv.ios.2", "tv.ios.3"]], ["tv.android.t", ["tv.android.1", "tv.android.2", "tv.android.3"]]].map(([tk, steps]) => (
            <details key={tk} style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line2}`, borderRadius: 12, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontSize: 13.5, fontWeight: 700, color: C.text, listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><PhoneIcon /> {t(tk)}</span>
                <span style={{ color: C.second }}><ChevronIcon /></span>
              </summary>
              <ol style={{ margin: "10px 0 2px", padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
                {steps.map((sk, i) => (
                  <li key={sk} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${C.gold}`, color: C.gold, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 800 }}>{i + 1}</span>
                    <span style={{ fontSize: 12.5, color: C.second, lineHeight: 1.5, paddingTop: 2 }}>{t(sk)}</span>
                  </li>
                ))}
              </ol>
            </details>
          ))}

          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "rgba(255,180,80,.08)", border: `1px solid ${C.gold}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold, display: "flex", alignItems: "center", gap: 7 }}><AlertIcon /> {t("tv.phone.warn.t")}</div>
            <p style={{ fontSize: 12.5, color: C.text, margin: "4px 0 0", lineHeight: 1.5 }}>{t("tv.phone.warn.d")}</p>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("tv.browser.t")}</div>
            <p style={{ fontSize: 12.5, color: C.second, margin: "4px 0 0", lineHeight: 1.5 }}>{t("tv.browser.d")}</p>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 20 }}>
          <h3 className="serif" style={{ fontSize: 20, color: C.text, margin: "0 0 12px" }}>{t("admin.settings")}</h3>

          <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.cover")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.cover.help")}</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 300, maxWidth: "100%", flexShrink: 0 }}>
                <div style={{ width: "100%", aspectRatio: "1.9 / 1", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line2}`, background: C.panel, display: "grid", placeItems: "center" }}>
                  {coverPath ? <img src={publicUrl(coverPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${Math.round(coverFx * 100)}% ${Math.round(coverFy * 100)}%` }} />
                    : <span style={{ color: C.second, fontSize: 11 }}>{t("admin.cover.none")}</span>}
                </div>
                {coverPath && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 11, color: C.second, marginBottom: 4 }}>{focusBusy ? t("admin.cover.framingBusy") : t("admin.cover.framing")}</div>
                    <input type="range" min="0" max="100" value={Math.round(coverFy * 100)} onChange={(e) => setCoverFy(Number(e.target.value) / 100)} style={{ width: "100%", accentColor: C.gold }} aria-label={t("admin.cover.framing")} />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.second }}>
                      <span>{t("admin.cover.framingTop")}</span>
                      <button onClick={() => autoFocus(coverPath, coverFile)} disabled={focusBusy} style={{ background: "transparent", color: C.gold, border: "none", padding: 0, fontSize: 10.5, fontWeight: 700, cursor: "pointer" }}>{t("admin.cover.framingAuto")}</button>
                      <span>{t("admin.cover.framingBottom")}</span>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label style={{ background: C.gold, color: C.ink, padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: coverBusy ? "default" : "pointer", opacity: coverBusy ? 0.6 : 1 }}>
                  {coverBusy ? t("admin.cover.uploading") : (coverPath ? t("admin.cover.change") : t("admin.cover.add"))}
                  <input type="file" accept="image/*" hidden disabled={coverBusy} onChange={(e) => { uploadCover(e.target.files[0]); e.target.value = ""; }} />
                </label>
                {coverPath && !coverBusy && (
                  <button onClick={async () => { try { await updateEvent({ cover_path: null }); setCoverPath(""); } catch (e) { alert(e.message); } }}
                    style={{ background: "transparent", color: C.second, border: `1px solid ${C.line2}`, padding: "9px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.cover.remove")}</button>
                )}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.look")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.look.help")}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {LOOKS.map((l) => {
                const on = look === l.key;
                return (
                  <button key={l.key} type="button" onClick={() => setLook(l.key)} aria-pressed={on}
                    style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: l.bg, color: l.text, border: `2px solid ${on ? l.gold : "rgba(255,255,255,.14)"}`, borderRadius: 12, padding: "9px 10px", cursor: "pointer", boxShadow: on ? `0 0 0 3px ${l.gold}33` : "none" }}>
                    <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: l.gold }} />
                      <span style={{ width: 14, height: 14, borderRadius: "50%", background: l.pink }} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.15 }}>{l.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.challenges")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.challenges.help")}</p>
            <Toggle on={chOn} onClick={() => setChOn((v) => !v)} title={t("admin.challengesOn")} />
            {chOn && (
              <>
                <textarea value={chText} onChange={(e) => setChText(e.target.value)} rows={8}
                  style={{ width: "100%", marginTop: 8, background: "rgba(255,255,255,.04)", color: C.text, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                <button type="button" onClick={() => setChText(DEFAULT_CHALLENGES.map((c) => challengeText(c, lang)).join("\n"))}
                  style={{ marginTop: 6, background: "none", border: "none", color: C.gold, fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0 }}>{t("admin.challengesReset")}</button>
              </>
            )}
          </div>
          <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.line2}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.modSection")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.modSection.help")}</p>
            <Toggle on={requireReview} onClick={() => setRequireReview((v) => !v)} title={t("admin.requireReview")} help={t("admin.requireReview.help")} />
            <Toggle on={protectMinors} onClick={() => setProtectMinors((v) => !v)} title={t("admin.protectMinors")} help={t("admin.protectMinors.help")} />
          </div>
          <Toggle on={isRecurring} onClick={() => setIsRecurring((v) => !v)} title={t("admin.recurring")} help={t("admin.recurring.help")} />
          {isRecurring && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.second }}>{t("admin.session")}: <strong style={{ color: C.text }}>{currentSession || today()}</strong></span>
              <button onClick={startNewSession} style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "8px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.startSession")}</button>
            </div>
          )}

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.connectCta")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.connectHelp")}</p>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div><label style={slab}>{t("admin.connectLabel")}</label><input style={sfield} value={connectLabel} onChange={(e) => setConnectLabel(e.target.value)} placeholder="New here? Get connected" /></div>
              <div><label style={slab}>{t("admin.connectLabelEs")}</label><input style={sfield} value={connectLabelEs} onChange={(e) => setConnectLabelEs(e.target.value)} placeholder="¿Primera vez? Conéctate" /></div>
              <div style={{ gridColumn: "1 / -1" }}><label style={slab}>{t("admin.connectUrl")}</label><input style={sfield} value={connectUrl} onChange={(e) => setConnectUrl(e.target.value)} placeholder="https://icgg.us/connect" /></div>
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.music")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.musicHelp")}</p>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={slab}>{t("admin.category")}</label>
                <select style={sfield} value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">—</option>
                  {["wedding", "quinceanera", "church", "corporate", "gala", "other"].map((c) => <option key={c} value={c}>{t("cat." + c)}</option>)}
                </select>
              </div>
              <div>
                <label style={slab}>{t("admin.music")}</label>
                <select style={sfield} value={musicUrl} onChange={(e) => setMusicUrl(e.target.value)}>
                  <option value="none">{t("admin.musicNone")}</option>
                  <option value="">{t("admin.musicAuto")}</option>
                  {libTracks.map((tr) => <option key={tr.id} value={tr.storage_path}>{t("admin.musicFromLib")}: {t("music." + tr.mood)}</option>)}
                  {musicUrl && musicUrl !== "none" && !libTracks.some((tr) => tr.storage_path === musicUrl) && (
                    <option value={musicUrl}>{t("admin.musicCustom")}</option>
                  )}
                </select>
              </div>
            </div>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={musicRightsOk} onChange={(e) => setMusicRightsOk(e.target.checked)} style={{ marginTop: 3 }} />
              <span style={{ fontSize: 12, color: C.second }}>{t("admin.musicRights")}</span>
            </label>
            <label style={{ display: "inline-block", marginTop: 10, background: "transparent", color: C.text, border: `1px solid ${musicRightsOk ? C.line2 : C.second}`, padding: "8px 14px", borderRadius: 999, fontSize: 12, cursor: musicRightsOk ? "pointer" : "not-allowed", opacity: musicBusy || !musicRightsOk ? 0.55 : 1 }} title={!musicRightsOk ? t("admin.musicRightsNeeded") : ""}>
              {musicBusy ? t("admin.musicUploading") : t("admin.musicUpload")}
              <input type="file" accept="audio/*" hidden disabled={musicBusy || !musicRightsOk} onChange={(e) => { uploadMusic(e.target.files[0]); e.target.value = ""; }} />
            </label>
            <p style={{ fontSize: 11, color: C.second, margin: "8px 0 0" }}>{t("admin.musicUploadTips")}</p>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
            <button onClick={saveSettings} disabled={saving} style={{ background: C.gold, color: C.ink, padding: "10px 18px", borderRadius: 10, fontSize: 14, opacity: saving ? 0.6 : 1 }}>{saving ? t("admin.saving") : t("admin.save")}</button>
            {savedMsg && <span style={{ fontSize: 12, color: C.second }}>{savedMsg}</span>}
          </div>

          {!event._cohost && <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(179,38,30,.25)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b3261e" }}>{t("admin.dangerZone")}</div>
            <p style={{ fontSize: 12, color: C.second, margin: "4px 0 10px" }}>{t("admin.deleteEventHelp")}</p>
            <button onClick={deleteEvent} disabled={deletingEvent} style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "10px 16px", borderRadius: 10, fontSize: 14, opacity: deletingEvent ? 0.6 : 1 }}>{deletingEvent ? t("admin.deletingEvent") : t("admin.deleteEvent")}</button>
          </div>}
        </div>
      )}

      {photos.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: C.card, border: `1px solid ${featured ? C.gold : "rgba(255,255,255,.1)"}`, borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.moment")}</span>
          {featured ? (
            <>
              <img src={featured.edited_url || featured.url} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }} />
              <span style={{ fontSize: 12, color: C.second }}>{featured.ownerName} · {counts[featured.id] || 0} {"♥"}</span>
              <button onClick={clearMoment} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.clearMoment")}</button>
            </>
          ) : <span style={{ fontSize: 12, color: C.second }}>{t("admin.momentNone")}</span>}
          <button onClick={pinTopMoment} style={{ marginLeft: "auto", background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.pinTopMoment")}</button>
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginTop: 18, background: C.card, border: `1px solid ${C.gold}`, borderRadius: 16, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 className="serif" style={{ fontSize: 22, color: C.text, margin: 0 }}>
                {t("admin.reviewQueue")} <span style={{ fontSize: 12, fontWeight: 700, color: C.text, background: C.gold, padding: "2px 9px", borderRadius: 999, verticalAlign: "middle" }}>{pending.length} {t("admin.pendingCount")}</span>
              </h3>
              <p style={{ fontSize: 12, color: C.second, margin: "4px 0 0" }}>{t("admin.reviewHintQueue")}</p>
            </div>
            <button onClick={() => moderate(pending.map((p) => p.id), "approved")} disabled={moderating}
              style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "9px 16px", borderRadius: 999, fontSize: 13, opacity: moderating ? 0.6 : 1 }}>
              {moderating ? t("admin.moderating") : t("admin.approveAll")}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 14, marginTop: 14 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ background: C.bg, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.gold}` }}>
                <div style={{ position: "relative" }}>
                  <a href={p.video_url || p.edited_url || p.url} target="_blank" rel="noreferrer" title={t("admin.viewFull")}>
                    <img src={p.edited_url || p.url} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", display: "block", cursor: "zoom-in" }} />
                  </a>
                  {p.video_url && (
                      <span style={{ position: "absolute", bottom: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, letterSpacing: .5, pointerEvents: "none" }}>
                        <VideoIcon size={12} /> {t("grid.video")}{p.duration ? ` 0:${String(Math.round(p.duration)).padStart(2, "0")}` : ""}
                      </span>
                    )}
                  {p.has_minors && (
                    <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{t("admin.kidsBadge")}</span>
                  )}
                  {p.auto_flagged && (
                    <span style={{ position: "absolute", top: 8, right: 8, background: "#b3261e", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{t("admin.autoFlagged")}</span>
                  )}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8 }}>{p.ownerName}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => moderate([p.id], "approved")} disabled={moderating} style={{ flex: 1, background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px", borderRadius: 8, fontSize: 12, opacity: moderating ? 0.6 : 1 }}>{t("admin.approve")}</button>
                    <button onClick={() => moderate([p.id], "hidden")} disabled={moderating} style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: moderating ? 0.6 : 1 }}>{t("admin.hide")}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <Spinner label={t("admin.loadingCollection")} /> : photos.length === 0 ? (
        <Empty title={t("admin.nothing.title")} sub={t("admin.nothing.sub")} />
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h3 className="serif" style={{ fontSize: 24, color: C.text, margin: 0 }}>{t("admin.collection")}</h3>
              <div style={{ fontSize: 12, color: C.second, marginTop: 2 }}>{photos.length} {t("admin.photosWord")} · {editedCount} {t("admin.autoEdited")}{rejected.length ? ` · ${rejected.length} ${t("admin.rejected")}` : ""}{dupCount ? ` · ${dupCount} ${t("admin.duplicates")}` : ""}</div>
              <div style={{ fontSize: 11.5, color: C.second, marginTop: 4, maxWidth: 520, lineHeight: 1.45 }}>{t("admin.collection.help")}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sessions.length > 0 && (
                <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} style={{ borderRadius: 999, border: `1px solid ${C.second}`, padding: "7px 12px", fontSize: 12, color: C.text, background: C.card }}>
                  <option value="all">{t("admin.allSessions")}</option>
                  {sessions.map((s) => <option key={s} value={s}>{t("admin.session")} {s}</option>)}
                </select>
              )}
              <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={{ borderRadius: 999, border: `1px solid ${C.second}`, padding: "7px 12px", fontSize: 12, color: C.text, background: C.card }}>
                <option value="all">{t("admin.tagFilter")}</option>
                {TAGS.map((tg) => <option key={tg} value={tg}>{t("tag." + tg)}</option>)}
              </select>
              <div title={t("admin.versionHelp")} style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${C.second}`, overflow: "hidden" }}>
                <button onClick={() => setVersion("edited")} style={{ background: version === "edited" ? C.ink : "transparent", color: version === "edited" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.edited")}</button>
                <button onClick={() => setVersion("original")} style={{ background: version === "original" ? C.ink : "transparent", color: version === "original" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.original")}</button>
              </div>
              <button onClick={() => setFilter(filter === "all" ? "kept" : "all")} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{filter === "all" ? t("admin.keptOnly") : `${t("admin.all")} (${photos.length})`}</button>
              <button onClick={downloadAll} disabled={!!zipping} style={{ background: C.gold, color: C.onInk, padding: "7px 14px", borderRadius: 999, fontSize: 12, opacity: zipping ? 0.8 : 1, minWidth: 150 }}>{zipping ? t("admin.zipping").replace("{done}", zipping.done).replace("{total}", zipping.total) : `${t("admin.downloadAllBtn")} (${shown.length})`}</button>
              {!selectMode ? (
                <button onClick={() => setSelectMode(true)} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.select")}</button>
              ) : (
                <button onClick={exitSelect} style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.done")}</button>
              )}
              {rejected.length > 0 && (
                <button onClick={deleteAllRejected} disabled={deleting} style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: deleting ? 0.6 : 1 }}>{t("admin.clearRejected")} {rejected.length} {t("admin.rejected")}</button>
              )}
            </div>
          </div>

          {selectMode && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: C.card, border: `1px solid rgba(255,255,255,.12)`, borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{selected.size} {t("admin.selected")}</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={selectAllShown} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.selectAllShown")}</button>
                  <button onClick={() => setSelected(new Set())} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.clear")}</button>
                  <button onClick={deleteSelected} disabled={deleting || selected.size === 0} style={{ background: "#b3261e", color: "#fff", padding: "6px 14px", borderRadius: 999, fontSize: 12, opacity: deleting || selected.size === 0 ? 0.5 : 1 }}>{deleting ? t("admin.deleting") : `${t("admin.delete")} ${selected.size}`}</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: C.second }}>{t("admin.tagged")}:</span>
                {TAGS.map((tg) => (
                  <button key={tg} onClick={() => tagPhotos([...selected], tg, "add")} disabled={tagging || selected.size === 0} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "5px 11px", borderRadius: 999, fontSize: 12, opacity: tagging || selected.size === 0 ? 0.5 : 1 }}>{t("tag." + tg)}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 14, marginTop: 16 }}>
            {shown.map((p) => {
              const isSel = selected.has(p.id);
              const statusLabel = p.status === "pending" ? t("admin.pendingBadge") : p.status === "hidden" ? t("admin.hiddenBadge") : null;
              const isFeatured = p.id === featuredId;
              const n = counts[p.id] || 0;
              return (
                <div key={p.id} className="card" onClick={() => selectMode && toggleSelect(p.id)}
                  style={{ background: C.card, borderRadius: 12, overflow: "hidden", border: isSel ? `2px solid ${C.gold}` : isFeatured ? `2px solid ${C.gold}` : "1px solid rgba(255,255,255,.08)", opacity: p.kept ? 1 : 0.6, cursor: selectMode ? "pointer" : "default" }}>
                  <div style={{ position: "relative" }}>
                    <img src={version === "edited" && p.edited_url ? p.edited_url : p.url} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
                    {p.video_url && (
                      <span style={{ position: "absolute", bottom: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,.7)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, letterSpacing: .5, pointerEvents: "none" }}>
                        <VideoIcon size={12} /> {t("grid.video")}{p.duration ? ` 0:${String(Math.round(p.duration)).padStart(2, "0")}` : ""}
                      </span>
                    )}
                    <span title={t("admin.qualityHelp")} style={{ position: "absolute", top: 8, right: 8, background: p.kept ? C.gold : "rgba(10,4,16,.75)", color: p.kept ? C.ink : C.onInk, fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.kept ? t("admin.pickBadge") : t("admin.qualityWord")} {p.quality}</span>
                    {version === "edited" && p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>{t("admin.enhancedBadge")}</span>
                    )}
                    {version === "edited" && !p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(10,4,16,.7)", color: C.onInk, fontSize: 10, padding: "2px 7px", borderRadius: 999 }}>{t("admin.enhancing")}</span>
                    )}
                    {statusLabel ? (
                      <span style={{ position: "absolute", bottom: 8, left: 8, background: p.status === "hidden" ? "#b3261e" : C.ink, color: p.status === "hidden" ? "#fff" : C.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{statusLabel}{p.has_minors ? ` · ${t("admin.kidsBadge")}` : ""}</span>
                    ) : p.is_burst_dup ? (
                      <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(10,4,16,.85)", color: C.onInk, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{t("admin.duplicateBadge")}</span>
                    ) : !selectMode && (
                      <button onClick={(e) => { e.stopPropagation(); isFeatured ? clearMoment() : pinMoment(p.id); }} title={t("admin.pinMoment")}
                        style={{ position: "absolute", bottom: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: isFeatured ? C.gold : "rgba(10,4,16,.6)", color: isFeatured ? C.ink : C.bg, border: "none", borderRadius: 999, padding: "3px 8px", fontSize: 12, cursor: "pointer", backdropFilter: "blur(4px)" }}>
                        {isFeatured ? "★" : "☆"}{n > 0 ? ` ${n}` : ""}
                      </button>
                    )}
                    {selectMode && (
                      <span style={{ position: "absolute", bottom: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: isSel ? C.gold : "rgba(255,255,255,.85)", border: `2px solid ${isSel ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.text, fontSize: 13, fontWeight: 700 }}>{isSel ? "✓" : ""}</span>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.ownerName}</div>
                    <div style={{ fontSize: 11, color: C.second, marginBottom: 8 }}>{qualityLine(p)}</div>
                    {(p.tags || []).length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {p.tags.map((tg) => (
                          <span key={tg} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", color: C.text, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999 }}>
                            {t("tag." + tg)}<span onClick={(e) => { e.stopPropagation(); tagPhotos([p.id], tg, "remove"); }} aria-label={t("admin.removeTag")} style={{ cursor: "pointer", color: C.second }}>{"×"}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {!selectMode && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => download(p)} style={{ flex: 1, background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px", borderRadius: 8, fontSize: 12 }}>{t("admin.download")}</button>
                        {p.status === "approved" ? (
                          <button onClick={() => moderate([p.id], "hidden")} disabled={moderating} title={t("admin.hide")} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: moderating ? 0.6 : 1 }}>{t("admin.hide")}</button>
                        ) : (
                          <button onClick={() => moderate([p.id], "approved")} disabled={moderating} title={t("admin.approve")} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: moderating ? 0.6 : 1 }}>{t("admin.approve")}</button>
                        )}
                        <button onClick={() => makeCrops(p)} disabled={cropping.has(p.id)} title={t("admin.socialCrops")} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: cropping.has(p.id) ? 0.6 : 1 }}>{cropping.has(p.id) ? t("admin.cropping") : t("admin.cropsBtn")}</button>
                        <button onClick={() => deleteOne(p.id)} disabled={deleting} title={t("admin.deleteHelp")} aria-label="Delete photo" style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: deleting ? 0.6 : 1 }}>{t("admin.delete")}</button>
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
