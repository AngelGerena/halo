import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { fetchReactions, like, rxKey } from "../lib/reactions.js";
import { signPhotoUploads, putToR2 } from "../lib/r2upload.js";
import { scoreImage, C, hamming } from "../lib/score.js";
import { Footer } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { CameraIcon, UploadIcon, ScreenIcon } from "../components/Icons.jsx";
import { preloadNsfw } from "../lib/nsfw.js";

const LS_KEY = (code) => `halo_contributor_${code}`;

export default function EventPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t, ev, lang } = useI18n();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contributor, setContributor] = useState(null); // {id, name}
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(0);
  const [tab, setTab] = useState("add");           // add | gallery | mine
  const [kidsInFrame, setKidsInFrame] = useState(false);
  useEffect(() => { if (tab === "gallery" && event) loadEveryone(event); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps // consent: children in these photos
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const burstRef = useRef([]); // {phash, quality} of kept photos this session (best-of-burst)

  // load event by code
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("events").select("*").eq("code", code).single();
      if (error || !data) { setEvent(false); setLoading(false); return; }
      setEvent(data);
      const saved = localStorage.getItem(LS_KEY(code));
      if (saved) {
        const c = JSON.parse(saved);
        setContributor(c);
        loadPhotos(c.id);
        loadEveryone(data);
      }
      setLoading(false);
    })();
  }, [code]);

  // Warm the in-browser explicit-content model in the background.
  // Warm the model as soon as the event loads: with add-first there is no name
  // screen to hide the load behind anymore.
  useEffect(() => { if (event) preloadNsfw(); }, [event]);

  // Everyone's photos (the whole event), for the Gallery tab. Only kept +
  // approved rows: anything held for the host (kids-flagged, review mode,
  // auto-flagged) stays out until approved. Scoped to the current session
  // for recurring events, same as the live screen.
  const [everyone, setEveryone] = useState([]);
  // "On the screen now": the live screen broadcasts which photo is up; if it's
  // one of ours, pulse it on the phone. Clears itself after a few seconds.
  const [onScreen, setOnScreen] = useState(null); // photo id
  useEffect(() => {
    if (!event || !contributor) return;
    const ch = supabase.channel(`now-${event.id}`)
      .on("broadcast", { event: "showing" }, ({ payload }) => {
        if (payload && payload.contributor_id === contributor.id) {
          setOnScreen(payload.photo_id);
          clearTimeout(window.__haloOnScreenT);
          window.__haloOnScreenT = setTimeout(() => setOnScreen(null), 7000);
        }
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [event, contributor]);
  // Reactions: per-kind counts for every photo we show + the set this device has sent.
  const [kinds, setKinds] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  async function refreshReactions(ids) {
    if (!ids.length) return;
    const r = await fetchReactions(ids);
    setKinds((prev) => ({ ...prev, ...r.kinds }));
    setLiked((prev) => new Set([...prev, ...r.liked]));
  }
  async function onLike(photoId, kind = "heart") {
    const key = rxKey(photoId, kind);
    if (liked.has(key)) return;
    setLiked((prev) => new Set(prev).add(key));
    setKinds((prev) => ({ ...prev, [photoId]: { ...(prev[photoId] || {}), [kind]: ((prev[photoId] || {})[kind] || 0) + 1 } }));
    try { await like(photoId, event.id, kind); } catch { /* keep optimistic */ }
  }
  async function loadEveryone(evrow) {
    if (!evrow) return;
    let q = supabase.from("photos").select("*")
      .eq("event_id", evrow.id).eq("kept", true).eq("status", "approved");
    if (evrow.current_session) q = q.eq("session_label", evrow.current_session);
    const { data } = await q.order("created_at", { ascending: false }).limit(500);
    const rows = (data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null }));
    setEveryone(rows);
    refreshReactions(rows.map((p) => p.id));
  }

  async function loadPhotos(contributorId) {
    const { data } = await supabase
      .from("photos").select("*")
      .eq("contributor_id", contributorId)
      .order("created_at", { ascending: false });
    const rows = (data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null }));
    setPhotos(rows);
    refreshReactions(rows.map((p) => p.id));
  }

  // Add first, name after. The first upload silently creates the guest as
  // "Guest" (anon:true); once their photos are in we ask who to thank.
  const ANON_NAME = "Guest";
  async function ensureContributor() {
    if (contributor) return contributor;
    const { data, error } = await supabase
      .from("contributors")
      .insert({ event_id: event.id, name: ANON_NAME, email: null })
      .select().single();
    if (error) { alert(t("event.startError")); return null; }
    const c = { id: data.id, name: data.name, anon: true };
    localStorage.setItem(LS_KEY(code), JSON.stringify(c));
    setContributor(c);
    loadEveryone(event);
    return c;
  }
  async function addFilesFirst(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const c = await ensureContributor();
    if (!c) return;
    setTab("add");
    // addFiles reads `contributor` from state; pass the fresh one explicitly.
    await addFiles(files, c);
  }
  const [nameSaving, setNameSaving] = useState(false);
  async function saveName() {
    if (!name.trim() || !contributor) return;
    setNameSaving(true);
    try {
      const r = await fetch("/.netlify/functions/rename-contributor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contributorId: contributor.id, name: name.trim(), email: email.trim() || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "save failed");
      const c = { id: contributor.id, name: j.contributor.name, anon: false };
      localStorage.setItem(LS_KEY(code), JSON.stringify(c));
      setContributor(c);
      if (email.trim()) {
        fetch("/.netlify/functions/notify-welcome", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), name: c.name, eventName: event.name, galleryUrl: `${window.location.origin}/g/${c.id}` }),
        }).catch(() => {});
      }
    } catch (e) { alert(t("event.startError")); }
    finally { setNameSaving(false); }
  }

  async function startSession() {
    if (!name.trim()) return;
    const { data, error } = await supabase
      .from("contributors")
      .insert({ event_id: event.id, name: name.trim(), email: email.trim() || null })
      .select().single();
    if (error) return alert(t("event.startError"));
    const c = { id: data.id, name: data.name };
    localStorage.setItem(LS_KEY(code), JSON.stringify(c));
    setContributor(c);

    // premium welcome email (fire-and-forget) if they shared one
    if (email.trim()) {
      fetch("/.netlify/functions/notify-welcome", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(), name: data.name, eventName: event.name,
          galleryUrl: `${window.location.origin}/g/${data.id}`,
        }),
      }).catch(() => {});
    }
  }

  async function addFiles(fileList, who = contributor) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (!who) return addFilesFirst(files);
    setUploading((u) => u + files.length);

    // moderation gate: public immediately, or held for the super-admin to review first.
    const needsReview = event.moderation_mode === "review" || (event.protect_minors && kidsInFrame);
    const sessionLabel = event.current_session || null; // recurring-service session tag

    for (const f of files) {
      try {
        const s = await scoreImage(f);
        // Best-of-burst: if this shot near-matches an already-kept one this session,
        // and the earlier one is at least as good, file it as a duplicate (not kept).
        let isBurstDup = false;
        if (s.phash) {
          for (const h of burstRef.current) {
            if (hamming(h.phash, s.phash) <= 10 && h.quality >= s.quality) { isBurstDup = true; break; }
          }
        }
        const kept = !isBurstDup && s.quality >= (event.keep_threshold ?? 45);
        if (kept && s.phash) burstRef.current.push({ phash: s.phash, quality: s.quality });

        // In-browser explicit-content auto-flag (graceful: never blocks an upload).
        let flagged = false;
        try { const { classifyFile } = await import("../lib/nsfw.js"); flagged = (await classifyFile(f)).flagged; } catch {}
        const status = (needsReview || flagged) ? "pending" : "approved";
        const tags = kidsInFrame ? ["kids"] : []; // reliable auto-tag from the consent flag

        // Upload straight to R2 via a short-lived presigned URL (secret stays server-side).
        const [signed] = await signPhotoUploads({
          eventId: event.id, contributorId: who.id, count: 1, contentType: f.type || "image/jpeg",
        });
        const path = signed.path;
        await putToR2(signed.uploadUrl, f, f.type || "image/jpeg");
        const { data: row, error } = await supabase.from("photos").insert({
          event_id: event.id,
          contributor_id: who.id,
          storage_path: path,
          quality: s.quality, focus: s.focus, exposure: s.exposure,
          kept, width: s.width, height: s.height,
          has_minors: kidsInFrame,
          status,
          session_label: sessionLabel,
          phash: s.phash,
          is_burst_dup: isBurstDup,
          auto_flagged: flagged,
          tags,
        }).select().single();
        if (error) throw error;
        setPhotos((prev) => [{ ...row, url: publicUrl(path) }, ...prev]);

        // fire auto-edit in the background; patch the row when ready.
        // contributorId proves this guest uploaded the photo (guests have no
        // account), so edit-photo can authorize the enhancement.
        fetch("/.netlify/functions/edit-photo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId: row.id, contributorId: who.id }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((res) => {
            if (res?.edited_path) {
              setPhotos((prev) => prev.map((p) =>
                p.id === row.id ? { ...p, edited_path: res.edited_path, edited_url: publicUrl(res.edited_path) } : p));
            }
          })
          .catch(() => {});
      } catch (e) {
        console.error(e);
      } finally {
        setUploading((u) => Math.max(0, u - 1));
      }
    }
    // The kids question is about THIS batch. Reset it so a guest who checked
    // it once (on purpose or by accident) doesn't have every later photo held.
    if (kidsInFrame) setKidsInFrame(false);
    loadEveryone(event);
  }

  // ---- loading / not-found ----
  if (loading) return <Dark><div style={S.center}><Ring small /><p style={{ color: C.second, marginTop: 14 }}>{t("event.opening")}</p></div></Dark>;
  if (event === false) return (
    <Dark><div style={S.center}>
      <h1 className="serif" style={{ fontSize: 30, margin: 0 }}>{t("event.notFound.title")}</h1>
      <p style={{ color: C.second, maxWidth: 320, margin: "10px 0 20px" }}>{t("event.notFound.sub")}</p>
      <button className="btn-gold" onClick={() => navigate("/")}>{t("gal.goHome")}</button>
    </div></Dark>
  );

  const coverUrl = event.cover_path ? publicUrl(event.cover_path) : null;
  // Smart framing: anchor every cover crop on the stored focal point (faces),
  // falling back to centre. See netlify/functions/cover-focus.js.
  const coverPos = `${Math.round((event.cover_focus_x ?? 0.5) * 100)}% ${Math.round((event.cover_focus_y ?? 0.5) * 100)}%`;

  // ====================================================================
  // CONCEPT 6 — WARM EDITORIAL WELCOME (sign-in)
  // ====================================================================
  if (!contributor) {
    return (
      <Dark welcome>
        <div style={{ maxWidth: 460, margin: "0 auto", padding: "26px 20px 48px" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            {coverUrl ? (
              <div style={S.coverWrap}>
                <img src={coverUrl} alt="" style={{ ...S.coverImg, objectPosition: coverPos }} />
                <div style={S.coverScrim} />
              </div>
            ) : null /* no cover yet: the host sets one from the dashboard; guests shouldn't see an "add" prompt they can't act on */}
            <p className="eyebrow" style={{ marginTop: 18 }}>{t("event.invited")}</p>
            <h1 className="serif" style={{ fontSize: 40, fontStyle: "italic", fontWeight: 600, margin: "6px 0 0", lineHeight: 1.02 }}>{ev(event, "name")}</h1>
            {([ev(event, "host"), ev(event, "event_date")].filter(Boolean).length > 0) && (
              <p style={{ color: C.second, margin: "8px 0 0", fontSize: 13 }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>
            )}
          </div>

          {/* No form before the first photo. Two buttons, then we ask who to thank. */}
          <div style={S.welcomeCard}>
            <p className="serif" style={{ fontStyle: "italic", fontSize: 16, lineHeight: 1.4, color: "#e9e3ef", textAlign: "center", margin: "0 0 18px" }}>
              {t("event.welcomeQuote")}
            </p>
            <button type="button" onClick={() => cameraRef.current?.click()} style={{ ...S.camBtn, padding: "0 0 12px" }}>
              <span style={S.camIc}><CameraIcon size={30} /></span>
              <span style={{ display: "block", fontWeight: 800, fontSize: 19, marginTop: 10 }}>{t("up.takePhoto")}</span>
              <span style={{ display: "block", fontSize: 12.5, color: C.second, marginTop: 3 }}>{t("up.takePhotoSub")}</span>
            </button>
            <div style={{ textAlign: "center" }}>
              <button type="button" onClick={() => inputRef.current?.click()} style={S.libBtn}>
                <UploadIcon size={18} /> {t("up.fromLibrary")}
              </button>
            </div>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { addFilesFirst(e.target.files); e.target.value = ""; }} />
            <input ref={inputRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => { addFilesFirst(e.target.files); e.target.value = ""; }} />
          </div>
          <p style={S.note}>{t("event.welcomeNote")}</p>
        </div>
      </Dark>
    );
  }

  // ====================================================================
  // CONCEPT 7 — COMMAND BAR (tabbed in-app)
  // ====================================================================
  const kept = photos.filter((p) => p.kept);
  const galleryShown = tab === "mine" ? photos : everyone; // "Mine" = all of mine, "Gallery" = everyone's kept + approved
  const shareUrl = `${window.location.origin}/g/${contributor.id}`;
  const connectLabel = (lang === "es" && event.connect_label_es) ? event.connect_label_es : (event.connect_label || t("connect.cta"));

  return (
    <Dark>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "18px 20px 96px" }}>
        {/* header: cover thumb + event name */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
          {/* The cover thumb doubles as the only way back to the main screen.
              Guests never need it; hosts bouncing between guest view, live
              screen and dashboard do. Kept quiet on purpose: no label. */}
          <a href="/" aria-label="HALO home" title="HALO home" style={{ ...S.thumb, textDecoration: "none" }}>
            {coverUrl ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: coverPos }} />
              : <span style={{ color: C.gold, fontSize: 18 }} aria-hidden="true">&#9673;</span>}
          </a>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 20, lineHeight: 1 }}>{ev(event, "name")}</div>
            <div style={{ color: C.second, fontSize: 11.5, marginTop: 3 }}>{contributor.anon ? t("up.welcomeAnon") : `${t("up.welcome")}, ${contributor.name}`}</div>
          </div>
        </div>

        {/* ---- ADD tab ----
            Built for a guest who has never seen HALO: lead with the one action
            (add photos), explain it in three tiny steps, speak plainly, and
            keep the kids question available but out of the way. */}
        {tab === "add" && (
          <>
            {onScreen && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, background: "rgba(255,61,129,.12)", border: `1px solid ${C.pink}`, borderRadius: 14, padding: "10px 14px", marginBottom: 14, animation: "haloPulse 1.2s ease-in-out infinite" }}>
                {(() => { const p = photos.find((x) => x.id === onScreen); return p ? <img src={p.edited_url || p.url} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", border: `2px solid ${C.pink}` }} /> : null; })()}
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{t("up.onScreenNow")}</div>
                  <div style={{ fontSize: 12.5, color: C.second }}>{t("up.onScreenNowSub")}</div>
                </div>
                <style>{`@keyframes haloPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,61,129,.35) } 50% { box-shadow: 0 0 0 8px rgba(255,61,129,0) } }`}</style>
              </div>
            )}
            {/* 1) How it works — three glanceable steps, no jargon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 12px", marginBottom: 14 }}>
              {[[CameraIcon, t("up.step1")], [UploadIcon, t("up.step2")], [ScreenIcon, t("up.step3")]].map(([Ic, label], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span aria-hidden="true" style={{ color: C.second, fontSize: 14, flexShrink: 0 }}>&#8250;</span>}
                  <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                    <div style={{ color: C.gold, display: "grid", placeItems: "center" }}><Ic size={24} /></div>
                    <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, marginTop: 5, lineHeight: 1.2 }}>{label}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* 2) THE action — biggest thing on the screen. Camera-first: the
                big button opens the phone camera directly (capture attr; on a
                laptop it just opens the picker). A second button opens the
                photo library for shots already taken. */}
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }} style={S.drop}>
              <button type="button" onClick={() => cameraRef.current?.click()} style={S.camBtn}>
                <span style={S.camIc}><CameraIcon size={30} /></span>
                <span style={{ display: "block", fontWeight: 800, fontSize: 19, marginTop: 10 }}>{t("up.takePhoto")}</span>
                <span style={{ display: "block", fontSize: 12.5, color: C.second, marginTop: 3 }}>{t("up.takePhotoSub")}</span>
              </button>
              <button type="button" onClick={() => inputRef.current?.click()} style={S.libBtn}>
                <UploadIcon size={18} /> {t("up.fromLibrary")}
              </button>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={inputRef} type="file" accept="image/*" multiple hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {uploading > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: C.second, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid rgba(255,255,255,.18)`, borderTopColor: C.gold, display: "inline-block" }} />
                {t("up.uploading")} {uploading}&hellip;
              </div>
            )}

            {/* 3) One warm line instead of two jargon stat tiles.
                First visit nudges them to the button; after that, a friendly count + what to do next. */}
            <div style={{ marginTop: 14, textAlign: "center", background: "rgba(255,184,107,.08)", border: `1px solid rgba(255,184,107,.25)`, borderRadius: 12, padding: "12px 14px" }}>
              {photos.length === 0 ? (
                <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{t("up.hintFirst")}</div>
              ) : (
                <>
                  {/* Show the latest photo(s) they added so the loop is obvious:
                      "that one is on the big screen now". Up to 3 thumbs, newest first. */}
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 10 }}>
                    {photos.slice(0, 3).map((p) => (
                      <div key={p.id} style={{ position: "relative", width: 72, height: 72, borderRadius: 12, overflow: "hidden", border: `2px solid ${p.status === "pending" ? C.second : C.gold}`, background: C.panel }}>
                        <img src={p.edited_url || p.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        <span style={{ position: "absolute", right: 4, bottom: 4, width: 18, height: 18, borderRadius: "50%", background: p.status === "pending" ? C.second : C.gold, color: C.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800 }}>{p.status === "pending" ? "…" : "✓"}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 15, color: C.gold, fontWeight: 700 }}>
                    {photos[0]?.status === "pending" ? t("up.latestHeld") : t("up.latestLive")}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.second, marginTop: 3 }}>
                    {photos.length === 1 ? t("up.countOne") : t("up.countMany").replace("{n}", photos.length)} {t("up.hintAfter")}
                  </div>
                  <button onClick={() => setTab("gallery")} className="btn-ghost" style={{ marginTop: 10, padding: "8px 16px", fontSize: 13 }}>{t("up.seeGallery")} &#8594;&#xFE0E;</button>
                </>
              )}
            </div>

            {/* 4) Kids question — still here for hosts who want it, but below the
                action and phrased as a simple question rather than a warning. */}
            {/* 2b) Who should we thank? Only once they've added something and
                haven't told us their name yet. Name is what the host sees under
                each photo and what the gallery link is addressed to. */}
            {contributor.anon && photos.length > 0 && (
              <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.gold}`, borderRadius: 16, padding: "14px 16px" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{t("up.whoTitle")}</div>
                <div style={{ fontSize: 12.5, color: C.second, marginTop: 3, marginBottom: 12 }}>{t("up.whoSub")}</div>
                <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("event.namePlaceholder")} autoComplete="name"
                  onKeyDown={(e) => e.key === "Enter" && saveName()} style={{ marginBottom: 10 }} />
                <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("up.whoEmail")} autoComplete="email"
                  onKeyDown={(e) => e.key === "Enter" && saveName()} style={{ marginBottom: 12 }} />
                <button className="btn-gold btn-full" onClick={saveName} disabled={nameSaving || !name.trim()} style={{ opacity: nameSaving || !name.trim() ? 0.6 : 1 }}>{nameSaving ? t("up.whoSaving") : t("up.whoSave")}</button>
              </div>
            )}

            <button type="button" onClick={() => setKidsInFrame((v) => !v)} aria-pressed={kidsInFrame}
              style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start",
                background: kidsInFrame ? "rgba(255,184,107,.12)" : "rgba(255,255,255,.03)",
                border: `1px solid ${kidsInFrame ? C.gold : C.line}`, borderRadius: 12, padding: "11px 13px", marginTop: 14 }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, marginTop: 1, background: kidsInFrame ? C.gold : "transparent", border: `2px solid ${kidsInFrame ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.ink, fontSize: 13, fontWeight: 800 }}>{kidsInFrame ? "✓" : ""}</span>
              <span>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{t("up.kidsToggle")}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.second, marginTop: 2 }}>{t("up.kidsHelp")}</span>
              </span>
            </button>

            {event.connect_url && (
              <a href={event.connect_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block", marginTop: 16 }}>
                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: "15px 17px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{connectLabel}</div>
                    <div style={{ color: C.gold, fontSize: 12, marginTop: 2 }}>{t("connect.sub")}</div>
                  </div>
                  <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `2px solid ${C.gold}`, color: C.gold, display: "grid", placeItems: "center", fontSize: 16 }}>&#8594;&#xFE0E;</span>
                </div>
              </a>
            )}

          </>
        )}

        {/* ---- GALLERY / MINE tabs ---- */}
        {(tab === "gallery" || tab === "mine") && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <div>
                <h3 className="serif" style={{ fontSize: 22, margin: 0, fontStyle: "italic", fontWeight: 600 }}>
                  {tab === "mine" ? t("up.allYours") : t("up.everyoneTitle")}
                </h3>
                <p style={{ fontSize: 12, color: C.second, margin: "3px 0 0" }}>
                  {tab === "mine" ? t("up.allYours.sub") : t("up.everyoneTitle.sub")}
                </p>
              </div>
              {tab === "mine" && (
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); alert(t("up.linkCopied") + "\n" + shareUrl); }}
                  className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12.5 }}>{t("up.copyShareLink")}</button>
              )}
            </div>
            {tab === "mine" && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <StatTile label={t("up.uploaded")} value={photos.length} />
                <StatTile label={t("up.keptByHalo")} value={kept.length} gold />
              </div>
            )}
            {galleryShown.length > 0 ? (
              <PhotoGrid photos={galleryShown} dimUnkept={tab === "mine"} kinds={kinds} liked={liked} onLike={onLike} />
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.second }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{t("up.emptyTitle")}</div>
                <p style={{ fontSize: 13, margin: "6px 0 16px" }}>{tab === "mine" ? t("up.emptySub") : t("up.emptySubEveryone")}</p>
                <button className="btn-gold" onClick={() => setTab("add")}>{t("up.tapToAdd")}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- bottom command bar ---- */}
      <nav style={S.tabbar} aria-label="HALO">
        <TabBtn active={tab === "add"} onClick={() => setTab("add")} icon="&#43;" label={t("tab.add")} />
        <TabBtn active={tab === "gallery"} onClick={() => setTab("gallery")} icon="&#9638;" label={t("tab.gallery")} />
        <TabBtn active={tab === "mine"} onClick={() => setTab("mine")} icon="&#9733;" label={t("tab.mine")} />
      </nav>
    </Dark>
  );
}

/* ---------- small presentational pieces ---------- */
function TabBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      style={{ flex: 1, textAlign: "center", padding: "11px 0", background: "transparent",
        color: active ? C.gold : C.second, borderTop: active ? `2px solid ${C.gold}` : "2px solid transparent", marginTop: -1 }}>
      <div style={{ fontSize: 17 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon + "︎" }} />
      <div style={{ fontSize: 11, letterSpacing: ".04em", marginTop: 2 }}>{label}</div>
    </button>
  );
}

function StatTile({ label, value, gold }) {
  return (
    <div style={{ flex: 1, background: "rgba(255,255,255,.04)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px" }}>
      <div className="display" style={{ fontSize: 26, lineHeight: 1, color: gold ? C.gold : "#fff" }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.second, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Ring({ small }) {
  const d = small ? 40 : 64;
  return <div className="spin" style={{ width: d, height: d, borderRadius: "50%", border: `3px solid rgba(255,255,255,.14)`, borderTopColor: C.gold }} />;
}

/* Dark app shell — cinematic gradient background, optional warm welcome tint, footer. */
function Dark({ children, welcome }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      background: welcome ? "linear-gradient(180deg,#1a1020,#120a19 60%,#0a0410)" : "radial-gradient(130% 70% at 50% -10%,rgba(123,47,247,.18),transparent 55%), #0a0410" }}>
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </div>
  );
}

const S = {
  center: { minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center", padding: "0 24px" },
  coverWrap: { position: "relative", height: 180, borderRadius: 18, overflow: "hidden", border: `1px solid ${C.line2}` },
  coverImg: { width: "100%", height: "100%", objectFit: "cover" },
  coverScrim: { position: "absolute", inset: 0, background: "linear-gradient(0deg,rgba(10,4,16,.7),rgba(10,4,16,.05) 60%)" },
  welcomeCard: { background: "rgba(255,255,255,.05)", border: `1px solid ${C.line2}`, borderRadius: 20, padding: "22px 20px" },
  note: { textAlign: "center", fontSize: 11.5, color: C.second, marginTop: 16, letterSpacing: ".03em" },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.panel, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center" },
  drop: { border: "1.6px dashed rgba(255,255,255,.28)", background: "rgba(255,255,255,.03)", borderRadius: 18, padding: "22px 20px 20px", textAlign: "center" },
  dropIc: { width: 46, height: 46, margin: "0 auto 10px", borderRadius: "50%", border: `3px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontSize: 22 },
  camBtn: { display: "block", width: "100%", background: "transparent", border: "none", color: C.text, padding: "6px 0 14px", cursor: "pointer", textAlign: "center" },
  camIc: { width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: C.gold, color: C.ink, display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(255,184,107,.35)" },
  libBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.06)", color: C.text, border: `1px solid ${C.line2}`, padding: "11px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabbar: { position: "sticky", bottom: 0, display: "flex", borderTop: `1px solid ${C.line}`, background: "#0d0716", backdropFilter: "blur(8px)" },
};
