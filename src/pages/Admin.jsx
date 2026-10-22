import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase, publicUrl } from "../lib/supabase.js";
import { signAdminUpload, putToR2 } from "../lib/r2upload.js";
import { C } from "../lib/score.js";
import { Header, Footer, Stat, Spinner, Empty } from "../components/UI.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { fetchOwnerProfiles, fetchAllProfiles, eventCountsByOwner, ownerLabel } from "../lib/profiles.js";

// TODO(auth integration): when src/lib/auth.jsx lands (AuthProvider/useAuth/
// RequireAuth), gate this page with RequireAuth + an is_admin check and pass the
// admin's Supabase access token to the service-role functions instead of (or
// alongside) the passcode. The passcode path below stays as a transitional
// admin override per docs/accounts-phase1-spec.md §6 — do not remove it until
// the admin account is confirmed in use.
const TOKEN_KEY = "halo_admin_token";
const TAGS = ["worship", "baptism", "kids", "fellowship"];

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
    <div style={{ maxWidth: 380, margin: "40px auto 0", background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 26 }}>
      <div style={{ display: "inline-flex", padding: "5px 12px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{t("admin.super")}</div>
      <h2 className="serif" style={{ fontSize: 28, color: C.text, margin: "12px 0 4px" }}>{t("admin.enterPasscode")}</h2>
      <p style={{ fontSize: 13, color: C.second, marginTop: 0 }}>{t("admin.passcode.help")}</p>
      <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t("admin.passcode")}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,.2)", marginBottom: 10 }} />
      {err && <div style={{ color: "#b3261e", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      <button onClick={submit} disabled={busy} style={{ width: "100%", background: C.gold, color: C.ink, padding: "13px", borderRadius: 10, fontSize: 15, opacity: busy ? 0.6 : 1 }}>{busy ? t("admin.checking2") : t("admin.unlock")}</button>
    </div>
  );
}

function Dashboard({ token, onLogout }) {
  const { t, ev } = useI18n();
  const [events, setEvents] = useState([]);
  const [profileMap, setProfileMap] = useState({});   // { owner_id: {id,email,full_name} } for owner labels
  const [clients, setClients] = useState([]);          // all profiles, for the client list + owner pickers
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heroList, setHeroList] = useState([]);
  const [heroOpen, setHeroOpen] = useState(false);
  const [heroBusy, setHeroBusy] = useState(false);
  const [libRows, setLibRows] = useState([]);
  const [libOpen, setLibOpen] = useState(false);
  const [libMood, setLibMood] = useState("elegant");
  const [libBusy, setLibBusy] = useState(false);

  async function loadEvents() {
    const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    const list = data || [];
    setEvents(list);
    setLoading(false);
    // Resolve each event's owner_id to a readable profile (fails soft pre-migration).
    const map = await fetchOwnerProfiles(list.map((e) => e.owner_id));
    setProfileMap(map);
  }
  useEffect(() => { loadEvents(); }, []);

  async function loadClients() {
    const rows = await fetchAllProfiles();
    setClients(rows);
  }
  useEffect(() => { loadClients(); }, []);

  const [deletingId, setDeletingId] = useState(null);
  async function deleteFromList(ev2) {
    const typed = window.prompt(`${t("admin.deleteEventConfirm")} ${ev2.code}`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== String(ev2.code).toUpperCase()) { alert(t("admin.deleteEventMismatch")); return; }
    setDeletingId(ev2.id);
    try {
      const r = await fetch("/.netlify/functions/delete-event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, eventId: ev2.id }),
      });
      const raw = await r.text();
      let j = {};
      try { j = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON response */ }
      if (!r.ok) throw new Error(j.error || `${t("admin.deleteEventFailed")} (${r.status})${raw && !j.error ? `: ${raw.slice(0, 180)}` : ""}`);
      await loadEvents();
    } catch (e) { alert(e.message); }
    finally { setDeletingId(null); }
  }

  async function loadHero() {
    const { data } = await supabase.from("hero_images").select("*").order("sort", { ascending: true });
    setHeroList(data || []);
  }
  useEffect(() => { loadHero(); }, []);

  async function heroAction(body) {
    const r = await fetch("/.netlify/functions/manage-hero", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: token, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Failed");
    return j;
  }
  async function uploadHero(files) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setHeroBusy(true);
    try {
      for (const f of list) {
        const { uploadUrl, path, contentType } = await signAdminUpload({
          passcode: token, kind: "hero", filename: f.name, contentType: f.type || "image/jpeg",
        });
        await putToR2(uploadUrl, f, contentType);
        await heroAction({ action: "add", storage_path: path });
      }
      await loadHero();
    } catch (e) { alert(e.message); } finally { setHeroBusy(false); }
  }
  async function toggleHero(h) { try { await heroAction({ action: "toggle", id: h.id, active: !h.active }); await loadHero(); } catch (e) { alert(e.message); } }
  async function removeHero(h) { if (!confirm("Remove this hero image?")) return; try { await heroAction({ action: "remove", id: h.id }); await loadHero(); } catch (e) { alert(e.message); } }
  async function moveHero(idx, dir) {
    const arr = [...heroList]; const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setHeroList(arr);
    try { await heroAction({ action: "reorder", ids: arr.map((x) => x.id) }); } catch (e) { alert(e.message); loadHero(); }
  }

  async function loadLib() {
    const { data } = await supabase.from("music_library").select("*").order("created_at", { ascending: false });
    setLibRows(data || []);
  }
  useEffect(() => { loadLib(); }, []);
  async function libAction(body) {
    const r = await fetch("/.netlify/functions/generate-music", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode: token, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Failed");
    return j;
  }
  async function genMusic() { setLibBusy(true); try { await libAction({ action: "generate", mood: libMood, count: 1 }); await loadLib(); } catch (e) { alert(e.message); } finally { setLibBusy(false); } }
  async function toggleLib(x) { try { await libAction({ action: "toggle", id: x.id, active: !x.active }); await loadLib(); } catch (e) { alert(e.message); } }
  async function removeLib(x) { if (!confirm("Delete this track?")) return; try { await libAction({ action: "remove", id: x.id }); await loadLib(); } catch (e) { alert(e.message); } }

  if (loading) return <Spinner label={t("admin.loadingEvents")} />;
  if (selected) return <EventDetail event={selected} token={token} clients={clients} profileMap={profileMap} back={() => { setSelected(null); loadEvents(); }} />;

  const eventCounts = eventCountsByOwner(events);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ display: "inline-flex", padding: "5px 12px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{t("admin.super")}</div>
          <h2 className="serif" style={{ fontSize: 32, color: C.text, margin: "8px 0 0" }}>{t("admin.yourEvents")}</h2>
        </div>
        <button onClick={onLogout} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "8px 14px", borderRadius: 999, fontSize: 13 }}>{t("admin.lock")}</button>
      </div>

      <CreateEvent token={token} clients={clients} onCreated={(newEvent) => { loadEvents(); if (newEvent) setSelected(newEvent); }} />

      {/* Landing hero carousel manager */}
      <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setHeroOpen((v) => !v)}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t("admin.heroManage")} <span style={{ color: C.second, fontWeight: 400 }}>({heroList.length})</span></div>
          <span style={{ color: C.second, fontSize: 18 }}>{heroOpen ? "\u2013" : "+"}</span>
        </div>
        {heroOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px" }}>{t("admin.heroHelp")}</p>
            <label style={{ display: "inline-block", background: C.gold, color: C.ink, padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: heroBusy ? 0.6 : 1 }}>
              {heroBusy ? t("admin.heroUploading") : t("admin.heroUpload")}
              <input type="file" accept="image/*" multiple hidden disabled={heroBusy} onChange={(e) => { uploadHero(e.target.files); e.target.value = ""; }} />
            </label>
            {heroList.length === 0 ? (
              <p style={{ fontSize: 13, color: C.second, marginTop: 12 }}>{t("admin.heroEmpty")}</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12, marginTop: 14 }}>
                {heroList.map((h, i) => (
                  <div key={h.id} style={{ background: C.bg, borderRadius: 12, overflow: "hidden", border: `1px solid ${h.active ? C.gold : "rgba(255,255,255,.12)"}` }}>
                    <img src={publicUrl(h.storage_path)} alt="" style={{ width: "100%", height: 110, objectFit: "cover", display: "block", opacity: h.active ? 1 : 0.45 }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", gap: 6 }}>
                      <button onClick={() => toggleHero(h)} style={{ background: h.active ? C.ink : "transparent", color: h.active ? C.bg : C.second, border: `1px solid ${h.active ? C.ink : C.second}`, padding: "5px 10px", borderRadius: 999, fontSize: 11 }}>{t("admin.heroActive")}</button>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => moveHero(i, -1)} disabled={i === 0} style={{ background: "transparent", border: `1px solid ${C.second}`, color: C.second, borderRadius: 8, padding: "4px 8px", fontSize: 12, opacity: i === 0 ? 0.4 : 1 }}>\u2191</button>
                        <button onClick={() => moveHero(i, 1)} disabled={i === heroList.length - 1} style={{ background: "transparent", border: `1px solid ${C.second}`, color: C.second, borderRadius: 8, padding: "4px 8px", fontSize: 12, opacity: i === heroList.length - 1 ? 0.4 : 1 }}>\u2193</button>
                        <button onClick={() => removeHero(h)} style={{ background: "transparent", border: "1px solid #b3261e", color: "#b3261e", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}>\uD83D\uDDD1</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Music library manager (Mubert) */}
      <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setLibOpen((v) => !v)}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t("admin.musicLib")} <span style={{ color: C.second, fontWeight: 400 }}>({libRows.length})</span></div>
          <span style={{ color: C.second, fontSize: 18 }}>{libOpen ? "\u2013" : "+"}</span>
        </div>
        {libOpen && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px" }}>{t("admin.musicLibHelp")}</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select value={libMood} onChange={(e) => setLibMood(e.target.value)} style={{ borderRadius: 999, border: `1px solid ${C.second}`, padding: "8px 12px", fontSize: 13, color: C.text, background: C.card }}>
                {["elegant", "celebration", "worship", "corporate", "cinematic", "acoustic"].map((m) => <option key={m} value={m}>{t("music." + m)}</option>)}
              </select>
              <button onClick={genMusic} disabled={libBusy} style={{ background: C.gold, color: C.ink, padding: "9px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, opacity: libBusy ? 0.6 : 1 }}>{libBusy ? t("admin.musicGenerating") : t("admin.musicGenerate")}</button>
            </div>
            {libRows.length === 0 ? (
              <p style={{ fontSize: 13, color: C.second, marginTop: 12 }}>{t("admin.musicLibEmpty")}</p>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {libRows.map((x) => (
                  <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.bg, borderRadius: 10, padding: "8px 12px", border: `1px solid ${x.active ? C.gold : "rgba(255,255,255,.12)"}` }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 90 }}>{t("music." + x.mood)}</span>
                    <audio controls preload="none" src={publicUrl(x.storage_path)} style={{ height: 34, flex: 1, minWidth: 180 }} />
                    <button onClick={() => toggleLib(x)} style={{ background: x.active ? C.ink : "transparent", color: x.active ? C.bg : C.second, border: `1px solid ${x.active ? C.ink : C.second}`, padding: "5px 10px", borderRadius: 999, fontSize: 11 }}>{t("admin.heroActive")}</button>
                    <button onClick={() => removeLib(x)} style={{ background: "transparent", border: "1px solid #b3261e", color: "#b3261e", borderRadius: 8, padding: "5px 9px", fontSize: 12 }}>\uD83D\uDDD1</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <SiteAppearance token={token} />

      <ClientList clients={clients} eventCounts={eventCounts} />

      {events.length === 0 ? (
        <Empty title={t("admin.noEvents.title")} sub={t("admin.noEvents.sub")} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginTop: 22 }}>
          {events.map((e) => (
            <div key={e.id} className="card"
              style={{ display: "flex", flexDirection: "column", background: C.card, border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
              <button onClick={() => setSelected(e)}
                style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", width: "100%" }}>
                <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{e.code}{e.is_recurring ? " · ↻" : ""}</div>
                <div className="serif" style={{ fontSize: 22, color: C.text, margin: "4px 0 2px", lineHeight: 1.1 }}>{ev(e, "name")}</div>
                <div style={{ fontSize: 12, color: C.second }}>{[ev(e, "host"), ev(e, "event_date")].filter(Boolean).join(" · ")}</div>
                <div style={{ fontSize: 11, color: C.second, marginTop: 6, wordBreak: "break-word" }}>
                  <span style={{ color: C.gold, fontWeight: 600 }}>{t("admin.owner")}:</span>{" "}
                  {ownerLabel(e.owner_id, profileMap) || t("admin.ownerUnassigned")}
                </div>
              </button>
              <button onClick={() => deleteFromList(e)} disabled={deletingId === e.id}
                style={{ marginTop: 14, alignSelf: "flex-start", background: "transparent", color: "#ff6b6b", border: "1px solid #ff6b6b", padding: "5px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: deletingId === e.id ? 0.5 : 1 }}>
                {deletingId === e.id ? t("admin.deleting") : t("admin.delete")}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Site Appearance: theme picker + swappable landing photos ----------------
// Writes go through the admin-only manage-site function; photo uploads reuse the
// existing signAdminUpload + putToR2 flow (kind "site"). The public landing page
// reads the result from /site-config on load and applies it.
const THEMES = [
  { key: "midnight", name: "Midnight Champagne", d1: "#ffb86b", d2: "#ff3d81", bg: "#0a0410" },
  { key: "blush",    name: "Blush Editorial",    d1: "#c98a6a", d2: "#b56a7f", bg: "#f6efe8" },
  { key: "obsidian", name: "Obsidian Neon",      d1: "#ff2d9b", d2: "#36e3ff", bg: "#000000" },
  { key: "emerald",  name: "Emerald Noir",       d1: "#d9b86a", d2: "#1f6e4f", bg: "#05110d" },
  { key: "sunset",   name: "Sunset Warmth",      d1: "#ff9e6b", d2: "#ff6b57", bg: "#1a0f0a" },
  { key: "plum",     name: "Royal Plum",         d1: "#c9a0ff", d2: "#ff7ad1", bg: "#0f0617" },
  { key: "ivory",    name: "Ivory & Ink",        d1: "#b9942f", d2: "#efe9dc", bg: "#f3f1ec" },
  { key: "sapphire", name: "Sapphire Night",     d1: "#e7c56b", d2: "#6ea8ff", bg: "#060b1a" },
  { key: "rosegold", name: "Rose Gold Mist",     d1: "#b76e79", d2: "#caa06a", bg: "#efe6e4" },
  { key: "onyx",     name: "Onyx & Amber",       d1: "#f0a830", d2: "#ff8a3d", bg: "#0c0a08" },
];
// slot key -> { label, default bundled image used when nothing is uploaded }
const PHOTO_SLOTS = [
  { slot: "friends",     label: "Intro photo (friends selfie)", def: "/landing/images/friends.webp" },
  { slot: "wedding",     label: "Banner photo (every guest, every angle)", def: "/landing/images/wedding.webp" },
  { slot: "qr",          label: "How-it-works photo (QR scan)", def: "/landing/images/qr-scan.webp" },
  { slot: "quinceanera", label: "Use-cases photo (quinceañera)", def: "/landing/images/quinceanera.webp" },
];

function SiteAppearance({ token }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(null);   // { theme, img_friends, ... }
  const [busy, setBusy] = useState("");             // "" | "theme" | slot key being uploaded
  const [saved, setSaved] = useState("");           // transient "Saved" flash key

  async function siteAction(body) {
    const r = await fetch("/.netlify/functions/manage-site", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: token, ...body }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || "Failed");
    return j;
  }
  async function load() {
    try { const j = await siteAction({ action: "get" }); setSettings(j.settings || {}); }
    catch (e) { setSettings({}); }
  }
  useEffect(() => { load(); }, []);

  function flash(key) { setSaved(key); setTimeout(() => setSaved((s) => (s === key ? "" : s)), 1600); }

  async function pickTheme(key) {
    if (busy) return;
    setBusy("theme");
    const prev = settings;
    setSettings((s) => ({ ...(s || {}), theme: key })); // optimistic
    try { const j = await siteAction({ action: "set-theme", theme: key }); setSettings(j.settings); flash("theme"); }
    catch (e) { setSettings(prev); alert(e.message); }
    finally { setBusy(""); }
  }
  async function uploadPhoto(slot, file) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    setBusy(slot);
    try {
      const { uploadUrl, path, contentType } = await signAdminUpload({
        passcode: token, kind: "site", filename: file.name, contentType: file.type || "image/jpeg",
      });
      await putToR2(uploadUrl, file, contentType);
      const j = await siteAction({ action: "set-image", slot, storage_path: path });
      setSettings(j.settings); flash(slot);
    } catch (e) { alert(e.message); } finally { setBusy(""); }
  }
  async function resetPhoto(slot) {
    if (busy) return;
    if (!confirm("Reset this photo back to the default that ships with the site?")) return;
    setBusy(slot);
    try { const j = await siteAction({ action: "reset-image", slot }); setSettings(j.settings); flash(slot); }
    catch (e) { alert(e.message); } finally { setBusy(""); }
  }

  const col = { friends: "img_friends", wedding: "img_wedding", qr: "img_qr", quinceanera: "img_quinceanera" };
  const activeTheme = (settings && settings.theme) || "midnight";

  return (
    <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Site appearance <span style={{ color: C.second, fontWeight: 400 }}>· theme &amp; photos</span></div>
        <span style={{ color: C.second, fontSize: 18 }}>{open ? "–" : "+"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 14 }}>
          {/* THEME PICKER */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Theme</div>
          <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px" }}>Pick a color palette for the public site (halo.finessemedia.pro). Changes go live within a minute.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            {THEMES.map((th) => {
              const on = activeTheme === th.key;
              return (
                <button key={th.key} onClick={() => pickTheme(th.key)} disabled={!!busy}
                  style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: on ? "rgba(255,184,107,.12)" : "rgba(255,255,255,.03)", border: `1px solid ${on ? C.gold : "rgba(255,255,255,.15)"}`, borderRadius: 12, padding: "10px 12px", cursor: busy ? "default" : "pointer", opacity: busy && busy !== "theme" ? 0.6 : 1 }}>
                  <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: `conic-gradient(from 135deg, ${th.d1} 0 50%, ${th.d2} 50% 100%)` }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.15 }}>{th.name}</span>
                  {on && <span style={{ marginLeft: "auto", color: C.gold, fontSize: 14 }}>{saved === "theme" ? "✓" : "●"}</span>}
                </button>
              );
            })}
          </div>

          {/* PHOTO SWAPPER */}
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "22px 0 4px" }}>Photos</div>
          <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px" }}>Replace any of the four landing-page photos. Upload a JPG, PNG or WebP (landscape works best). Reset puts the original back.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 14 }}>
            {PHOTO_SLOTS.map((p) => {
              const stored = settings && settings[col[p.slot]];
              const preview = stored ? publicUrl(stored) : p.def;
              const uploading = busy === p.slot;
              return (
                <div key={p.slot} style={{ background: C.bg, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.12)" }}>
                  <div style={{ position: "relative" }}>
                    <img src={preview} alt="" style={{ width: "100%", height: 120, objectFit: "cover", display: "block", opacity: uploading ? 0.5 : 1 }} />
                    {saved === p.slot && <span style={{ position: "absolute", top: 8, right: 8, background: C.gold, color: C.ink, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>Saved</span>}
                    {stored && <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,.6)", color: "#fff", fontSize: 10, fontWeight: 600, letterSpacing: .5, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999 }}>Custom</span>}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 8, lineHeight: 1.25 }}>{p.label}</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <label style={{ display: "inline-block", background: C.gold, color: C.ink, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                        {uploading ? "Uploading…" : "Replace"}
                        <input type="file" accept="image/*" hidden disabled={!!busy} onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; uploadPhoto(p.slot, f); }} />
                      </label>
                      {stored && <button onClick={() => resetPhoto(p.slot)} disabled={!!busy} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12, opacity: busy ? 0.6 : 1 }}>Reset</button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Collapsible list of every client (profile) with a per-client event count.
// Reads from the profiles table via the admin RLS read policy. Fails soft to an
// empty list (and simply shows the empty state) until the profiles table is live.
function ClientList({ clients, eventCounts }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  function joined(iso) {
    if (!iso) return "";
    try {
      // AM/PM, never 24-hour — per brand preference, in both languages.
      return new Date(iso).toLocaleString(lang === "es" ? "es-US" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
    } catch { return ""; }
  }

  return (
    <div style={{ marginTop: 18, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t("admin.clients")} <span style={{ color: C.second, fontWeight: 400 }}>({clients.length})</span></div>
        <span style={{ color: C.second, fontSize: 18 }}>{open ? "–" : "+"}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: C.second, margin: "0 0 12px" }}>{t("admin.clientsHelp")}</p>
          {clients.length === 0 ? (
            <p style={{ fontSize: 13, color: C.second, marginTop: 4 }}>{t("admin.clientsEmpty")}</p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {clients.map((c) => {
                const name = (c.full_name || "").trim();
                const count = eventCounts[c.id] || 0;
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.bg, borderRadius: 10, padding: "10px 12px", border: `1px solid ${c.is_admin ? C.gold : "rgba(255,255,255,.12)"}` }}>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, wordBreak: "break-word" }}>
                        {name || t("admin.clientNoName")}
                        {c.is_admin && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: C.ink, background: C.gold, padding: "2px 8px", borderRadius: 999 }}>{t("admin.clientAdmin")}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.second, wordBreak: "break-word" }}>{c.email || "—"}</div>
                      {c.created_at && <div style={{ fontSize: 11, color: C.second, marginTop: 2 }}>{t("admin.clientJoined")}: {joined(c.created_at)}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div className="serif" style={{ fontSize: 22, fontWeight: 700, color: count > 0 ? C.gold : C.second, lineHeight: 1 }}>{count}</div>
                      <div style={{ fontSize: 11, color: C.second, textTransform: "uppercase", letterSpacing: 1 }}>{t("admin.clientEvents")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, title, help }) {
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

function CreateEvent({ token, clients = [], onCreated }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [date, setDate] = useState("");
  const [code, setCode] = useState("");
  const [threshold, setThreshold] = useState(45);
  const [category, setCategory] = useState("");
  const [ownerId, setOwnerId] = useState(""); // "" = owned by the admin (self); otherwise a client's profile id
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
          code: finalCode, keep_threshold: Number(threshold), category: category || null,
          moderation_mode: requireReview ? "review" : "off",
          protect_minors: protectMinors,
          // Create-on-behalf: owner_id of the chosen client, or null = admin owns it.
          // create-event stamps owner_id from this when the caller is admin.
          ownerId: ownerId || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { throw new Error(j.error || t("admin.failedCreate")); }
      setName(""); setHost(""); setDate(""); setCode(""); setThreshold(45); setCategory(""); setOwnerId("");
      setNameEs(""); setHostEs(""); setDateEs(""); setRequireReview(false); setProtectMinors(true); setOpen(false);
      onCreated(j.event);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (!open) {
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
        {clients.length > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={lab}>{t("admin.createFor")}</label>
            <select style={field} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{t("admin.createForSelf")}</option>
              {clients.filter((c) => !c.is_admin).map((c) => (
                <option key={c.id} value={c.id}>{[(c.full_name || "").trim(), c.email].filter(Boolean).join(" — ") || c.id}</option>
              ))}
            </select>
            <p style={{ fontSize: 11, color: C.second, margin: "6px 0 0" }}>{t("admin.createForHelp")}</p>
          </div>
        )}
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

function EventDetail({ event, token, clients = [], profileMap = {}, back }) {
  const { t, ev } = useI18n();
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
  // V2 settings + moment
  const [featuredId, setFeaturedId] = useState(event.featured_photo_id || null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRecurring, setIsRecurring] = useState(!!event.is_recurring);
  const [currentSession, setCurrentSession] = useState(event.current_session || "");
  const [connectLabel, setConnectLabel] = useState(event.connect_label || "");
  const [connectLabelEs, setConnectLabelEs] = useState(event.connect_label_es || "");
  const [connectUrl, setConnectUrl] = useState(event.connect_url || "");
  const [category, setCategory] = useState(event.category || "");
  const [coverPath, setCoverPath] = useState(event.cover_path || "");
  const [coverBusy, setCoverBusy] = useState(false);
  const [musicUrl, setMusicUrl] = useState(event.music_url || "");
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicRightsOk, setMusicRightsOk] = useState(!!event.music_rights_ack);
  const [libTracks, setLibTracks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [deletingEvent, setDeletingEvent] = useState(false);
  // Owner reassignment
  const [ownerId, setOwnerId] = useState(event.owner_id || "");
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerMsg, setOwnerMsg] = useState("");

  const eventUrl = `${window.location.origin}/e/${event.code}`;
  const liveUrl = `${window.location.origin}/live/${event.code}`;
  const today = () => new Date().toISOString().slice(0, 10);

  // Combined owner lookup: profiles resolved from the events list, plus the full
  // client list, so a just-reassigned owner renders immediately without a reload.
  const ownerLookup = { ...profileMap, ...Object.fromEntries(clients.map((c) => [c.id, c])) };

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
    QRCode.toDataURL(eventUrl, { width: 320, margin: 1, color: { dark: "#16294C", light: "#ffffff" } }).then(setQr).catch(() => setQr(""));
    (async () => {
      const [{ data: ph }, { data: co }, { data: rx }] = await Promise.all([
        supabase.from("photos").select("*").eq("event_id", event.id).order("created_at", { ascending: false }),
        supabase.from("contributors").select("*").eq("event_id", event.id),
        supabase.from("reactions").select("photo_id").eq("event_id", event.id),
      ]);
      const names = Object.fromEntries((co || []).map((c) => [c.id, c.name]));
      const cmap = {};
      (rx || []).forEach((r) => { cmap[r.photo_id] = (cmap[r.photo_id] || 0) + 1; });
      setCounts(cmap);
      setContributors(co || []);
      setPhotos((ph || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, ownerName: names[p.contributor_id] || "Unknown" })));
      setLoading(false);
    })();
    (async () => {
      const { data: lib } = await supabase.from("music_library").select("*").eq("active", true).order("created_at", { ascending: false });
      setLibTracks(lib || []);
    })();
  }, [event.id]);

  // --- V2: patch event settings via passcode-gated function ---
  async function updateEvent(patch) {
    const r = await fetch("/.netlify/functions/update-event", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode: token, eventId: event.id, patch }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || t("admin.saveFailed"));
    return j.event;
  }

  // Reassign owner: patches owner_id via update-event. The function must add
  // owner_id to its ALLOWED whitelist and permit the change only for admins.
  async function saveOwner() {
    setOwnerSaving(true); setOwnerMsg("");
    try {
      await updateEvent({ owner_id: ownerId || null });
      setOwnerMsg(t("admin.reassignDone"));
    } catch (e) { setOwnerMsg(e.message); } finally { setOwnerSaving(false); }
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
        is_recurring: isRecurring,
        current_session: isRecurring ? (currentSession || today()) : null,
        connect_label: connectLabel.trim() || null,
        connect_label_es: connectLabelEs.trim() || null,
        connect_url: connectUrl.trim() || null,
        category: category || null,
        cover_path: coverPath || null,
        music_url: musicUrl || null,
        music_rights_ack: !!musicRightsOk,
        music_rights_ack_at: musicRightsOk ? new Date().toISOString() : null,
      };
      const updated = await updateEvent(patch);
      setCurrentSession(updated.current_session || "");
      setSavedMsg(t("admin.saved"));
    } catch (e) { setSavedMsg(e.message); } finally { setSaving(false); }
  }

  async function uploadCover(file) {
    if (!file || !file.type.startsWith("image/")) return;
    setCoverBusy(true);
    try {
      const { uploadUrl, path, contentType } = await signAdminUpload({
        passcode: token, kind: "cover", filename: file.name, contentType: file.type || "image/jpeg",
      });
      await putToR2(uploadUrl, file, contentType);
      setCoverPath(path);
      await updateEvent({ cover_path: path }); // save immediately so guests see it right away
    } catch (e) { alert(e.message); } finally { setCoverBusy(false); }
  }

  async function uploadMusic(file) {
    if (!file) return;
    setMusicBusy(true);
    try {
      const { uploadUrl, path, contentType } = await signAdminUpload({
        passcode: token, kind: "music", filename: file.name, contentType: file.type || "audio/mpeg",
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
      const r = await fetch("/.netlify/functions/delete-event", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, eventId: event.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t("admin.deleteEventFailed"));
      back();
    } catch (e) { alert(e.message); setDeletingEvent(false); }
  }

  function download(p) {
    const useEdited = version === "edited" && p.edited_url;
    const href = useEdited ? p.edited_url : p.url;
    const tag = useEdited ? "edited" : "orig";
    const a = document.createElement("a");
    a.href = href; a.download = `HALO_${event.code}_${p.ownerName.replace(/\s+/g, "-")}_${tag}_${p.id.slice(0, 6)}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  }
  async function downloadAll() {
    for (const p of shown) { download(p); await new Promise((r) => setTimeout(r, 350)); }
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
      const r = await fetch("/.netlify/functions/moderate-photos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, photoIds: ids, status }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
      const set = new Set(ids);
      setPhotos((prev) => prev.map((p) => (set.has(p.id) ? { ...p, status } : p)));
    } catch (e) { alert(e.message); } finally { setModerating(false); }
  }

  async function makeCrops(p) {
    setCropping((prev) => new Set(prev).add(p.id));
    try {
      let crops = p.crops;
      if (!crops || Object.keys(crops).length < 4) {
        const r = await fetch("/.netlify/functions/crop-photo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode: token, photoId: p.id }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || t("admin.cropError"));
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
      const r = await fetch("/.netlify/functions/tag-photos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: token, photoIds: ids, tag, op }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Failed");
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
    } catch (e) { alert(t("admin.couldNotDelete") + " " + e.message); } finally { setDeleting(false); }
  }
  const deleteOne = (id) => deleteIds([id]);
  const deleteSelected = () => deleteIds([...selected], "selected");
  const deleteAllRejected = () => deleteIds(photos.filter((p) => !p.kept).map((p) => p.id), "rejected");

  const kept = photos.filter((p) => p.kept);
  const rejected = photos.filter((p) => !p.kept);
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

      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 22, alignItems: "center", marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 22 }}>
        <div style={{ textAlign: "center" }}>
          {qr && <img src={qr} alt="Event QR code" style={{ width: 160, height: 160, borderRadius: 10 }} />}
          <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "center" }}>
            {qr && (
              <a href={qr} download={`HALO-QR-${event.code}.png`} style={{ textDecoration: "none" }}>
                <button style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.saveQR")}</button>
              </a>
            )}
            <button onClick={() => { navigator.clipboard?.writeText(eventUrl); alert(t("admin.linkCopied") + "\n" + eventUrl); }} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 8, fontSize: 12 }}>{t("admin.copyLink")}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{event.code}{isRecurring ? ` · ${t("admin.session")} ${currentSession || today()}` : ""}</div>
          <h2 className="serif" style={{ fontSize: 30, color: C.text, margin: "4px 0 2px" }}>{ev(event, "name")}</h2>
          <p style={{ color: C.second, margin: "0 0 8px" }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>
          <div style={{ fontSize: 12, color: C.second, margin: "0 0 14px", wordBreak: "break-word" }}>
            <span style={{ color: C.gold, fontWeight: 600 }}>{t("admin.owner")}:</span>{" "}
            {ownerLabel(ownerId, ownerLookup) || t("admin.ownerUnassigned")}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Stat label={t("admin.photos")} value={photos.length} />
            <Stat label={t("admin.kept")} value={kept.length} gold />
            <Stat label={t("admin.contributors")} value={contributors.length} />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <a href={liveUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
              <button style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "10px 16px", borderRadius: 10, fontSize: 13 }}>{t("admin.launchSlideshow")}</button>
            </a>
            <button onClick={publish} disabled={publishing} style={{ background: C.gold, color: C.ink, padding: "10px 16px", borderRadius: 10, fontSize: 13, opacity: publishing ? 0.6 : 1 }}>
              {publishing ? t("admin.publishing") : event.published_at ? t("admin.resendEmails") : t("admin.publishNotify")}
            </button>
            {publishMsg && <span style={{ fontSize: 12, color: C.second }}>{publishMsg}</span>}
          </div>
        </div>
      </div>

      {/* V2 Settings panel: recurring sessions + connect CTA */}
      {settingsOpen && (
        <div style={{ marginTop: 16, background: C.card, border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: 20 }}>
          <h3 className="serif" style={{ fontSize: 20, color: C.text, margin: "0 0 12px" }}>{t("admin.settings")}</h3>

          {/* Event cover photo — the host sets this; guests see it as their welcome hero */}
          <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.cover")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.cover.help")}</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ width: 120, height: 76, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: `1px solid ${C.line2}`, background: C.panel, display: "grid", placeItems: "center" }}>
                {coverPath ? <img src={publicUrl(coverPath)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <span style={{ color: C.second, fontSize: 11 }}>{t("admin.cover.none")}</span>}
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

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,.1)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.reassign")}</div>
            <p style={{ fontSize: 11, color: C.second, margin: "4px 0 10px" }}>{t("admin.reassignHelp")}</p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} style={{ ...sfield, marginTop: 0, flex: 1, minWidth: 220 }}>
                <option value="">{t("admin.ownerUnassigned")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{[(c.full_name || "").trim(), c.email].filter(Boolean).join(" — ") || c.id}{c.is_admin ? ` (${t("admin.clientAdmin")})` : ""}</option>
                ))}
              </select>
              <button onClick={saveOwner} disabled={ownerSaving || ownerId === (event.owner_id || "")} style={{ background: C.gold, color: C.ink, padding: "10px 18px", borderRadius: 10, fontSize: 14, opacity: ownerSaving || ownerId === (event.owner_id || "") ? 0.55 : 1 }}>{ownerSaving ? t("admin.reassignSaving") : t("admin.reassignSave")}</button>
            </div>
            {ownerMsg && <p style={{ fontSize: 12, color: C.second, margin: "8px 0 0" }}>{ownerMsg}</p>}
            {clients.length === 0 && <p style={{ fontSize: 11, color: C.second, margin: "8px 0 0" }}>{t("admin.clientsEmpty")}</p>}
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(179,38,30,.25)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#b3261e" }}>{t("admin.dangerZone")}</div>
            <p style={{ fontSize: 12, color: C.second, margin: "4px 0 10px" }}>{t("admin.deleteEventHelp")}</p>
            <button onClick={deleteEvent} disabled={deletingEvent} style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "10px 16px", borderRadius: 10, fontSize: 14, opacity: deletingEvent ? 0.6 : 1 }}>{deletingEvent ? t("admin.deletingEvent") : t("admin.deleteEvent")}</button>
          </div>
        </div>
      )}

      {/* V2 Moment of the service strip */}
      {photos.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: C.card, border: `1px solid ${featured ? C.gold : "rgba(255,255,255,.1)"}`, borderRadius: 12, padding: "10px 14px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{t("admin.moment")}</span>
          {featured ? (
            <>
              <img src={featured.edited_url || featured.url} alt="" style={{ width: 38, height: 38, borderRadius: 8, objectFit: "cover" }} />
              <span style={{ fontSize: 12, color: C.second }}>{featured.ownerName} · {counts[featured.id] || 0} ♥</span>
              <button onClick={clearMoment} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "6px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.clearMoment")}</button>
            </>
          ) : <span style={{ fontSize: 12, color: C.second }}>{t("admin.momentNone")}</span>}
          <button onClick={pinTopMoment} style={{ marginLeft: "auto", background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.pinTopMoment")}</button>
        </div>
      )}

      {/* V2 Review queue */}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 14, marginTop: 14 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ background: C.bg, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.gold}` }}>
                <div style={{ position: "relative" }}>
                  <img src={p.edited_url || p.url} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
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
              <div style={{ fontSize: 12, color: C.second, marginTop: 2 }}>{editedCount} / {photos.length} {t("admin.autoEdited")}{rejected.length ? ` · ${rejected.length} ${t("admin.rejected")}` : ""}{dupCount ? ` · ${dupCount} ${t("admin.duplicates")}` : ""}</div>
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
              <div style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${C.second}`, overflow: "hidden" }}>
                <button onClick={() => setVersion("edited")} style={{ background: version === "edited" ? C.ink : "transparent", color: version === "edited" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.edited")}</button>
                <button onClick={() => setVersion("original")} style={{ background: version === "original" ? C.ink : "transparent", color: version === "original" ? C.bg : C.second, padding: "7px 12px", fontSize: 12, border: "none", borderRadius: 0 }}>{t("admin.original")}</button>
              </div>
              <button onClick={() => setFilter(filter === "all" ? "kept" : "all")} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{filter === "all" ? t("admin.keptOnly") : `${t("admin.all")} (${photos.length})`}</button>
              <button onClick={downloadAll} style={{ background: C.gold, color: C.ink, padding: "7px 14px", borderRadius: 999, fontSize: 12 }}>{t("admin.download")} {filter === "all" ? t("admin.all").toLowerCase() : t("admin.kept").toLowerCase()} ({version})</button>
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: 14, marginTop: 16 }}>
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
                    <span style={{ position: "absolute", top: 8, right: 8, background: p.kept ? C.gold : C.second, color: C.text, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{p.quality}</span>
                    {version === "edited" && p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: C.ink, color: C.gold, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>EDITED</span>
                    )}
                    {version === "edited" && !p.edited_url && (
                      <span style={{ position: "absolute", top: 8, left: 8, background: "rgba(10,4,16,.7)", color: C.onInk, fontSize: 10, padding: "2px 7px", borderRadius: 999 }}>processing…</span>
                    )}
                    {statusLabel ? (
                      <span style={{ position: "absolute", bottom: 8, left: 8, background: p.status === "hidden" ? "#b3261e" : C.ink, color: p.status === "hidden" ? "#fff" : C.gold, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{statusLabel}{p.has_minors ? ` · ${t("admin.kidsBadge")}` : ""}</span>
                    ) : p.is_burst_dup ? (
                      <span style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(10,4,16,.85)", color: C.onInk, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999 }}>{t("admin.duplicateBadge")}</span>
                    ) : !selectMode && (
                      <button onClick={(e) => { e.stopPropagation(); isFeatured ? clearMoment() : pinMoment(p.id); }} title={t("admin.pinMoment")}
                        style={{ position: "absolute", bottom: 8, left: 8, display: "flex", alignItems: "center", gap: 4, background: isFeatured ? C.gold : "rgba(10,4,16,.6)", color: isFeatured ? C.ink : C.bg, border: "none", borderRadius: 999, padding: "3px 8px", fontSize: 12, cursor: "pointer", backdropFilter: "blur(4px)" }}>
                        {isFeatured ? "â˜…" : "â˜†"}{n > 0 ? ` ${n}` : ""}
                      </button>
                    )}
                    {selectMode && (
                      <span style={{ position: "absolute", bottom: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: isSel ? C.gold : "rgba(255,255,255,.85)", border: `2px solid ${isSel ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.text, fontSize: 13, fontWeight: 700 }}>{isSel ? "✓" : ""}</span>
                    )}
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{p.ownerName}</div>
                    <div style={{ fontSize: 11, color: C.second, marginBottom: 8 }}>focus {p.focus} · exp {p.exposure}</div>
                    {(p.tags || []).length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {p.tags.map((tg) => (
                          <span key={tg} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,.08)", color: C.text, fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999 }}>
                            {t("tag." + tg)}<span onClick={(e) => { e.stopPropagation(); tagPhotos([p.id], tg, "remove"); }} aria-label={t("admin.removeTag")} style={{ cursor: "pointer", color: C.second }}>Ã—</span>
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
                        <button onClick={() => makeCrops(p)} disabled={cropping.has(p.id)} title={t("admin.socialCrops")} style={{ background: "transparent", color: C.text, border: `1px solid ${C.line2}`, padding: "7px 10px", borderRadius: 8, fontSize: 12, opacity: cropping.has(p.id) ? 0.6 : 1 }}>{cropping.has(p.id) ? t("admin.cropping") : "â›¶"}</button>
                        <button onClick={() => deleteOne(p.id)} disabled={deleting} title="Delete" aria-label="Delete photo" style={{ background: "transparent", color: "#b3261e", border: "1px solid #b3261e", padding: "7px 10px", borderRadius: 8, fontSize: 13, opacity: deleting ? 0.6 : 1 }}>ðŸ—‘</button>
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
