import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { fetchReactions, like, rxKey } from "../lib/reactions.js";
import { shrinkImage } from "../lib/shrink.js";
import { signPhotoUploads, putToR2 } from "../lib/r2upload.js";
import { scoreImage, C, hamming } from "../lib/score.js";
import { Footer, LangToggle } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { applyLook, clearLook } from "../lib/looks.js";
import { CameraIcon, UploadIcon, ScreenIcon, VideoIcon } from "../components/Icons.jsx";
import { probeClip, isVideoFile, MAX_CLIP_SECONDS, MAX_CLIP_BYTES } from "../lib/clip.js";
import { challengesFor, challengeText } from "../lib/challenges.js";
import { preloadNsfw } from "../lib/nsfw.js";
import { useAuth } from "../lib/auth.jsx";
import { makeApi } from "../lib/authedFetch.js";

const LS_KEY = (code) => `halo_contributor_${code}`;

export default function EventPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t, ev, lang } = useI18n();
  const [event, setEvent] = useState(null);
  // Is the person on this page the event's host (owner or co-host)? Then the
  // tab bar gets a Manage tab that goes straight back to this event's tools.
  const { user, session } = useAuth();
  const [isHost, setIsHost] = useState(false);
  useEffect(() => {
    let alive = true;
    setIsHost(false);
    if (!user || !event) return;
    if (event.owner_id && event.owner_id === user.id) { setIsHost(true); return; }
    makeApi(session).fn("cohost-events", {})
      .then((r) => { if (alive && (r.events || []).some((e) => e.id === event.id)) setIsHost(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, session, event]);
  // Per-event look: restyle via CSS variables while this page is mounted.
  useEffect(() => { if (event && event.look) applyLook(event.look); return () => clearLook(); }, [event && event.look]);
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
  const videoRef = useRef(null);
  const [notice, setNotice] = useState(""); // friendly one-line message (e.g. clip too long)
  const [challenge, setChallenge] = useState(null); // challenge id the next upload answers
  // Guestbook: a short message for the couple / guest of honor.
  const [wish, setWish] = useState("");
  const [wishName, setWishName] = useState("");
  const [wishState, setWishState] = useState("idle"); // idle | sending | sent | error
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
    const rows = (data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, video_url: p.video_path ? publicUrl(p.video_path) : null }));
    setEveryone(rows);
    refreshReactions(rows.map((p) => p.id));
  }

  async function loadPhotos(contributorId) {
    const { data } = await supabase
      .from("photos").select("*")
      .eq("contributor_id", contributorId)
      .order("created_at", { ascending: false });
    const rows = (data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, video_url: p.video_path ? publicUrl(p.video_path) : null }));
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

  // ---- Uploads that never get lost ----
  // Each photo is tried up to 4 times with growing pauses (1 s, 2.5 s, 6 s).
  // If it still can't go (Wi-Fi dropped, phone went into a dead spot), it
  // waits in `waiting` and goes again on its own when the connection returns
  // or every 20 s. The guest sees "N waiting to send" instead of a silent loss.
  const [waiting, setWaiting] = useState([]); // [{ id, file, who, kids }]
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function withRetry(fn, tries = 4) {
    let pause = 1000;
    for (let i = 0; ; i++) {
      try { return await fn(); }
      catch (e) {
        if (i >= tries - 1 || (typeof navigator !== "undefined" && navigator.onLine === false)) throw e;
        await sleep(pause); pause *= 2.5;
      }
    }
  }

  // Score, upload and record one photo. Returns true when it's safely in.
  async function uploadOne(original, who, kids, challengeId = null) {
    // Shrink on the phone first: 5-10x smaller, so uploads finish on busy venue Wi-Fi.
    const f = await shrinkImage(original);
    const s = await scoreImage(f);
    // moderation gate: public immediately, or held for the super-admin to review first.
    const needsReview = event.moderation_mode === "review" || (event.protect_minors && kids);
    const sessionLabel = event.current_session || null; // recurring-service session tag
    // Best-of-burst: if this shot near-matches an already-kept one this session,
    // and the earlier one is at least as good, file it as a duplicate (not kept).
    let isBurstDup = false;
    if (s.phash) {
      for (const h of burstRef.current) {
        if (hamming(h.phash, s.phash) <= 10 && h.quality >= s.quality) { isBurstDup = true; break; }
      }
    }
    const kept = !isBurstDup && s.quality >= (event.keep_threshold ?? 45);

    // In-browser explicit-content auto-flag (graceful: never blocks an upload).
    let flagged = false;
    try { const { classifyFile } = await import("../lib/nsfw.js"); flagged = (await classifyFile(f)).flagged; } catch {}
    const status = (needsReview || flagged) ? "pending" : "approved";
    const tags = kids ? ["kids"] : []; // reliable auto-tag from the consent flag

    // Upload straight to R2 via a short-lived presigned URL (secret stays server-side).
    const path = await withRetry(async () => {
      const [signed] = await signPhotoUploads({
        eventId: event.id, contributorId: who.id, count: 1, contentType: f.type || "image/jpeg",
      });
      await putToR2(signed.uploadUrl, f, f.type || "image/jpeg");
      return signed.path;
    });
    const row = await withRetry(async () => {
      const { data, error } = await supabase.from("photos").insert({
        event_id: event.id,
        contributor_id: who.id,
        storage_path: path,
        quality: s.quality, focus: s.focus, exposure: s.exposure,
        kept, width: s.width, height: s.height,
        has_minors: kids,
        status,
        session_label: sessionLabel,
        phash: s.phash,
        is_burst_dup: isBurstDup,
        auto_flagged: flagged,
        tags,
        ...(challengeId ? { challenge: challengeId } : {}),
      }).select().single();
      if (error) throw error;
      return data;
    });
    // Only remember it for burst matching once it's really in, so a retry
    // of the same photo is never mistaken for its own duplicate.
    if (kept && s.phash) burstRef.current.push({ phash: s.phash, quality: s.quality });
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
    return true;
  }

  // A short video clip: its still frame becomes storage_path (so every grid,
  // email and thumbnail just works) and the clip itself goes in video_path.
  async function uploadClip(file, who, kids, challengeId = null) {
    const info = await probeClip(file);
    if (file.size > MAX_CLIP_BYTES || info.duration > MAX_CLIP_SECONDS + 0.5) {
      const err = new Error("clip too long"); err.tooLong = true; throw err;
    }
    const needsReview = event.moderation_mode === "review" || (event.protect_minors && kids);
    const poster = new File([info.poster], "frame.jpg", { type: "image/jpeg" });
    let flagged = false;
    if (info.decoded) {
      try { const { classifyFile } = await import("../lib/nsfw.js"); flagged = (await classifyFile(poster)).flagged; } catch {}
    }
    const status = (needsReview || flagged) ? "pending" : "approved";
    const posterPath = await withRetry(async () => {
      const [s1] = await signPhotoUploads({ eventId: event.id, contributorId: who.id, count: 1, contentType: "image/jpeg" });
      await putToR2(s1.uploadUrl, poster, s1.contentType);
      return s1.path;
    });
    const videoPath = await withRetry(async () => {
      const [s2] = await signPhotoUploads({ eventId: event.id, contributorId: who.id, count: 1, contentType: file.type || "video/mp4" });
      await putToR2(s2.uploadUrl, file, s2.contentType);
      return s2.path;
    }, 5);
    const row = await withRetry(async () => {
      const { data, error } = await supabase.from("photos").insert({
        event_id: event.id,
        contributor_id: who.id,
        storage_path: posterPath,
        video_path: videoPath,
        duration: info.duration || null,
        quality: 100, kept: true,
        width: info.width || null, height: info.height || null,
        has_minors: kids,
        status,
        session_label: event.current_session || null,
        auto_flagged: flagged,
        tags: kids ? ["kids"] : [],
        ...(challengeId ? { challenge: challengeId } : {}),
      }).select().single();
      if (error) throw error;
      return data;
    });
    setPhotos((prev) => [{ ...row, url: publicUrl(posterPath), video_url: publicUrl(videoPath) }, ...prev]);
    return true;
  }

  async function sendWish() {
    const message = wish.trim().slice(0, 280);
    if (!message || !event) return;
    const who = contributor && !contributor.anon && contributor.name !== ANON_NAME ? contributor.name : (wishName.trim() || null);
    setWishState("sending");
    try {
      await withRetry(async () => {
        const { error } = await supabase.from("wishes").insert({
          event_id: event.id,
          contributor_id: contributor ? contributor.id : null,
          name: who,
          message,
          status: event.moderation_mode === "review" ? "pending" : "approved",
        });
        if (error) throw error;
      }, 3);
      setWish(""); setWishState("sent");
    } catch { setWishState("error"); }
  }

  async function addFiles(fileList, who = contributor) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/") || isVideoFile(f));
    if (!who) return addFilesFirst(files);
    setNotice("");
    const kids = kidsInFrame;
    const ch = challenge;
    setUploading((u) => u + files.length);
    for (const original of files) {
      try {
        if (isVideoFile(original)) await uploadClip(original, who, kids, ch);
        else await uploadOne(original, who, kids, ch);
      } catch (e) {
        console.error(e);
        if (e && e.tooLong) { setNotice(t("up.clipTooLong").replace("{s}", MAX_CLIP_SECONDS)); continue; }
        setWaiting((w) => [...w, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: original, who, kids, ch }]);
      } finally {
        setUploading((u) => Math.max(0, u - 1));
      }
    }
    // The kids question is about THIS batch. Reset it so a guest who checked
    // it once (on purpose or by accident) doesn't have every later photo held.
    if (kidsInFrame) setKidsInFrame(false);
    if (ch) setChallenge(null);
    loadEveryone(event);
  }

  // Send anything still waiting. Runs on reconnect, every 20 s, or on tap.
  const flushingRef = useRef(false);
  const waitingRef = useRef(waiting); useEffect(() => { waitingRef.current = waiting; }, [waiting]);
  async function flushWaiting() {
    if (flushingRef.current || !waitingRef.current.length || !event) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushingRef.current = true;
    try {
      for (const item of [...waitingRef.current]) {
        try {
          if (isVideoFile(item.file)) await uploadClip(item.file, item.who, item.kids, item.ch);
          else await uploadOne(item.file, item.who, item.kids, item.ch);
          setWaiting((w) => w.filter((x) => x.id !== item.id));
        } catch { break; } // still offline; try again later
      }
      loadEveryone(event);
    } finally { flushingRef.current = false; }
  }
  useEffect(() => {
    if (!waiting.length) return;
    const onOnline = () => flushWaiting();
    window.addEventListener("online", onOnline);
    const tmr = setInterval(flushWaiting, 20000);
    // Warn before closing the page while photos are still on the phone only.
    const onLeave = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onLeave);
    return () => { window.removeEventListener("online", onOnline); clearInterval(tmr); window.removeEventListener("beforeunload", onLeave); };
  }, [waiting.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "-12px 0 10px" }}><LangToggle /></div>
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
            <p className="serif" style={{ fontStyle: "italic", fontSize: 16, lineHeight: 1.4, color: C.text, opacity: .88, textAlign: "center", margin: "0 0 18px" }}>
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
            <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden
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
          <div style={{ marginLeft: "auto", flex: "0 0 auto" }}><LangToggle /></div>
        </div>

        {/* ---- ADD tab ----
            Built for a guest who has never seen HALO: lead with the one action
            (add photos), explain it in three tiny steps, speak plainly, and
            keep the kids question available but out of the way. */}
        {tab === "add" && (
          <>
            {/* Order: kids question (it must be answered BEFORE uploading),
                the buttons, what just happened, then the extras. */}
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
            {photos.length === 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, background: "rgba(var(--tint, 255,255,255),.03)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 12px", marginBottom: 14 }}>
              {[[CameraIcon, t("up.step1")], [UploadIcon, t("up.step2")], [ScreenIcon, t("up.step3")]].map(([Ic, label], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span aria-hidden="true" style={{ color: C.second, fontSize: 14, flexShrink: 0 }}>&#8250;</span>}
                  <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                    <div style={{ color: C.gold, display: "grid", placeItems: "center" }}><Ic size={24} /></div>
                    <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, marginTop: 5, lineHeight: 1.2 }}>{label}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>}

            <button type="button" onClick={() => setKidsInFrame((v) => !v)} aria-pressed={kidsInFrame}
              style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start",
                background: kidsInFrame ? "rgba(255,184,107,.12)" : "rgba(var(--tint, 255,255,255),.03)",
                border: `1px solid ${kidsInFrame ? C.gold : C.line}`, borderRadius: 12, padding: "10px 12px", marginBottom: 12 }}>
              <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, marginTop: 1, background: kidsInFrame ? C.gold : "transparent", border: `2px solid ${kidsInFrame ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.ink, fontSize: 13, fontWeight: 800 }}>{kidsInFrame && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>}</span>
              <span>
                <span style={{ display: "block", fontSize: 13.5, fontWeight: 600 }}>{kidsInFrame ? t("up.kidsOn") : t("up.kidsToggle")}</span>
                <span style={{ display: "block", fontSize: 11.5, color: C.second, marginTop: 2 }}>{kidsInFrame ? t("up.kidsOnHelp") : t("up.kidsHelpShort")}</span>
              </span>
            </button>

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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                <button type="button" onClick={() => videoRef.current?.click()} style={S.libBtn}>
                  <VideoIcon size={18} /> {t("up.recordVideo")}
                </button>
                <button type="button" onClick={() => inputRef.current?.click()} style={S.libBtn}>
                  <UploadIcon size={18} /> {t("up.fromLibrary")}
                </button>
              </div>
              <div style={{ fontSize: 11.5, color: C.second, marginTop: 8 }}>{t("up.videoHint").replace("{s}", MAX_CLIP_SECONDS)}</div>
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </div>

            {notice && (
              <div role="alert" style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(255,61,129,.1)", border: `1px solid rgba(255,61,129,.35)`, borderRadius: 12, padding: "10px 12px", fontSize: 13, color: C.text }}>
                <span style={{ flex: 1 }}>{notice}</span>
                <button type="button" onClick={() => setNotice("")} aria-label={t("up.dismiss")} style={{ background: "none", border: "none", color: C.second, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>{t("up.dismiss")}</button>
              </div>
            )}

            {waiting.length > 0 && (
              <div role="status" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, background: "rgba(255,184,107,.1)", border: `1px solid rgba(255,184,107,.35)`, borderRadius: 12, padding: "10px 12px" }}>
                <span className="spin" style={{ width: 16, height: 16, flex: "0 0 auto", borderRadius: "50%", border: `2px solid rgba(var(--tint, 255,255,255),.18)`, borderTopColor: C.gold, display: "inline-block" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{t("up.waiting").replace("{n}", waiting.length)}</div>
                  <div style={{ fontSize: 12, color: C.second }}>{t("up.waitingSub")}</div>
                </div>
                <button type="button" onClick={flushWaiting} style={{ flex: "0 0 auto", background: C.gold, color: C.onInk, border: "none", borderRadius: 999, padding: "7px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{t("up.tryNow")}</button>
              </div>
            )}

            {uploading > 0 && (
              <div style={{ marginTop: 12, fontSize: 13, color: C.second, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid rgba(var(--tint, 255,255,255),.18)`, borderTopColor: C.gold, display: "inline-block" }} />
                {t("up.uploading")} {uploading}&hellip;
              </div>
            )}

            {/* 3) One warm line instead of two jargon stat tiles.
                First visit nudges them to the button; after that, a friendly count + what to do next. */}
            {photos.length > 0 && <div style={{ marginTop: 14, textAlign: "center", background: "rgba(255,184,107,.08)", border: `1px solid rgba(255,184,107,.25)`, borderRadius: 12, padding: "12px 14px" }}>
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
            </div>}

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

            {/* Photo challenges: tap one, the camera opens, the photo is tagged with it. */}
            {(() => {
              const list = challengesFor(event);
              if (!list.length) return null;
              const done = new Set(photos.map((p) => p.challenge).filter(Boolean));
              const active = list.find((c) => c.id === challenge);
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{t("ch.title")}</div>
                    <div style={{ fontSize: 12, color: C.gold, fontWeight: 700 }}>{t("ch.progress").replace("{done}", list.filter((c) => done.has(c.id)).length).replace("{total}", list.length)}</div>
                  </div>
                  {active && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,184,107,.12)", border: `1px solid ${C.gold}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text }}><strong>{t("ch.now")}</strong> {challengeText(active, lang)}</div>
                      <button type="button" onClick={() => inputRef.current?.click()} style={{ ...S.libBtn, padding: "6px 10px", fontSize: 12 }}>{t("ch.fromLibrary")}</button>
                      <button type="button" onClick={() => setChallenge(null)} style={{ background: "none", border: "none", color: C.second, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>{t("ch.cancel")}</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6, scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch" }}>
                    {list.map((c) => {
                      const isDone = done.has(c.id), on = c.id === challenge;
                      return (
                        <button key={c.id} type="button" onClick={() => { setChallenge(c.id); cameraRef.current?.click(); }}
                          style={{ flex: "0 0 auto", width: 150, minHeight: 74, scrollSnapAlign: "start", textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 6, background: on ? "rgba(255,184,107,.18)" : isDone ? "rgba(var(--tint, 255,255,255),.04)" : "rgba(var(--tint, 255,255,255),.07)", border: `1px solid ${on ? C.gold : isDone ? "rgba(255,184,107,.45)" : C.line2}`, borderRadius: 14, padding: "10px 12px", color: C.text, cursor: "pointer" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{challengeText(c, lang)}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: isDone ? C.gold : C.second }}>
                            {isDone ? (
                              <><svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{t("ch.done")}</>
                            ) : (
                              <><CameraIcon size={13} />{t("ch.shoot")}</>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Guestbook: a message that shows on the big screen and goes in the keepsake */}
            <div style={{ marginTop: 16, background: "rgba(var(--tint, 255,255,255),.04)", border: `1px solid ${C.line2}`, borderRadius: 16, padding: "14px 14px 12px" }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{t("gb.title")}</div>
              <div style={{ fontSize: 12, color: C.second, margin: "3px 0 10px" }}>{t("gb.sub")}</div>
              {wishState === "sent" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div style={{ color: C.gold, fontWeight: 700, fontSize: 14 }}>{t("gb.thanks")}</div>
                  <button type="button" onClick={() => setWishState("idle")} style={{ ...S.libBtn, padding: "7px 14px", fontSize: 13 }}>{t("gb.another")}</button>
                </div>
              ) : (
                <>
                  {(!contributor || contributor.anon || contributor.name === ANON_NAME) && (
                    <input value={wishName} onChange={(e) => setWishName(e.target.value)} placeholder={t("gb.name")} maxLength={60} autoComplete="name"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, background: "rgba(var(--shade, 0,0,0),.25)", color: C.text, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "inherit" }} />
                  )}
                  <textarea value={wish} onChange={(e) => setWish(e.target.value.slice(0, 280))} rows={3} placeholder={t("gb.placeholder")}
                    style={{ width: "100%", boxSizing: "border-box", background: "rgba(var(--shade, 0,0,0),.25)", color: C.text, border: `1px solid ${C.line2}`, borderRadius: 10, padding: "10px 12px", fontSize: 15, lineHeight: 1.45, fontFamily: "inherit", resize: "vertical" }} />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: wishState === "error" ? C.pink : C.second }}>{wishState === "error" ? t("gb.error") : `${wish.length}/280`}</span>
                    <button type="button" onClick={sendWish} disabled={!wish.trim() || wishState === "sending"}
                      style={{ background: C.gold, color: C.onInk, border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 800, fontSize: 14, cursor: "pointer", opacity: !wish.trim() || wishState === "sending" ? 0.55 : 1 }}>
                      {wishState === "sending" ? t("gb.sending") : t("gb.send")}
                    </button>
                  </div>
                </>
              )}
            </div>

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
                <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{t("up.emptyTitle")}</div>
                <p style={{ fontSize: 13, margin: "6px 0 16px" }}>{tab === "mine" ? t("up.emptySub") : t("up.emptySubEveryone")}</p>
                <button className="btn-gold" onClick={() => setTab("add")}>{t("up.tapToAdd")}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---- bottom command bar ---- */}
      <nav style={S.tabbar} aria-label="HALO">
        <TabBtn active={tab === "add"} onClick={() => setTab("add")} label={t("tab.add")}
          iconNode={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>} />
        <TabBtn active={tab === "gallery"} onClick={() => setTab("gallery")} label={t("tab.gallery")}
          iconNode={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>} />
        <TabBtn active={tab === "mine"} onClick={() => setTab("mine")} label={t("tab.mine")}
          iconNode={<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 4-5.5 7-5.5s5.8 1.9 7 5.5" /></svg>} />
        {isHost && (
          <TabBtn active={false} onClick={() => navigate(`/dashboard?event=${encodeURIComponent(event.code)}`)} label={t("tab.manage")}
            iconNode={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>} />
        )}
      </nav>
    </Dark>
  );
}

/* ---------- small presentational pieces ---------- */
function TabBtn({ active, onClick, icon, iconNode, label }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined}
      style={{ flex: 1, textAlign: "center", padding: "11px 0", background: "transparent",
        color: active ? C.gold : C.second, borderTop: active ? `2px solid ${C.gold}` : "2px solid transparent", marginTop: -1 }}>
      {iconNode
        ? <div style={{ height: 22, display: "flex", justifyContent: "center", alignItems: "center" }} aria-hidden="true">{iconNode}</div>
        : <div style={{ fontSize: 17 }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: icon + "︎" }} />}
      <div style={{ fontSize: 11, letterSpacing: ".04em", marginTop: 2 }}>{label}</div>
    </button>
  );
}

function StatTile({ label, value, gold }) {
  return (
    <div style={{ flex: 1, background: "rgba(var(--tint, 255,255,255),.04)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 14px" }}>
      <div className="display" style={{ fontSize: 26, lineHeight: 1, color: gold ? C.gold : C.text }}>{value}</div>
      <div style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.second, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Ring({ small }) {
  const d = small ? 40 : 64;
  return <div className="spin" style={{ width: d, height: d, borderRadius: "50%", border: `3px solid rgba(var(--tint, 255,255,255),.14)`, borderTopColor: C.gold }} />;
}

/* Dark app shell — cinematic gradient background, optional warm welcome tint, footer. */
function Dark({ children, welcome }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      background: welcome ? "linear-gradient(180deg, var(--panel2, #1a1020), var(--panel, #120a19) 60%, var(--page, var(--ink, #0a0410)))" : "radial-gradient(130% 70% at 50% -10%, rgba(123,47,247,.18), transparent 55%), var(--page, var(--ink, #0a0410))", color: C.text }}>
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
  welcomeCard: { background: "rgba(var(--tint, 255,255,255),.05)", border: `1px solid ${C.line2}`, borderRadius: 20, padding: "22px 20px" },
  note: { textAlign: "center", fontSize: 11.5, color: C.second, marginTop: 16, letterSpacing: ".03em" },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.panel, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center" },
  drop: { border: "1.6px dashed rgba(var(--tint, 255,255,255),.28)", background: "rgba(var(--tint, 255,255,255),.03)", borderRadius: 18, padding: "22px 20px 20px", textAlign: "center" },
  dropIc: { width: 46, height: 46, margin: "0 auto 10px", borderRadius: "50%", border: `3px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontSize: 22 },
  camBtn: { display: "block", width: "100%", background: "transparent", border: "none", color: C.text, padding: "6px 0 14px", cursor: "pointer", textAlign: "center" },
  camIc: { width: 72, height: 72, margin: "0 auto", borderRadius: "50%", background: C.gold, color: C.ink, display: "grid", placeItems: "center", boxShadow: "0 8px 24px rgba(255,184,107,.35)" },
  libBtn: { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(var(--tint, 255,255,255),.06)", color: C.text, border: `1px solid ${C.line2}`, padding: "11px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabbar: { position: "sticky", bottom: 0, display: "flex", borderTop: `1px solid ${C.line}`, background: "var(--tabbar, #0d0716)", backdropFilter: "blur(8px)" },
};
