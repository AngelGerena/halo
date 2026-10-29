import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { fetchReactions, like, getDeviceId, rxKey } from "../lib/reactions.js";
import { ReactionBuddy, LIVE_REACTION_CSS } from "../components/LiveReactions.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { applyLook, clearLook } from "../lib/looks.js";
import QRCode from "qrcode";
import ShowOnTVSheet, { ShowOnTVButton, pillBtn } from "../components/ShowOnTV.jsx";
import { WALL_SECONDS } from "../lib/clip.js";
import { challengesFor, challengeText } from "../lib/challenges.js";

// Slideshow music: explicit choice wins; otherwise auto-match by event type.
const CAT_MUSIC = { wedding: "/music/elegant.mp3", quinceanera: "/music/celebration.mp3", church: "/music/worship.mp3", corporate: "/music/corporate.mp3", gala: "/music/elegant.mp3", other: "/music/cinematic.mp3" };
const CAT_MOOD = { wedding: "elegant", quinceanera: "celebration", church: "worship", corporate: "corporate", gala: "elegant", other: "cinematic" };
function resolveMusic(ev) {
  if (!ev) return null;
  const m = ev.music_url;
  if (m === "none") return null;
  if (m) return (m.startsWith("/") || m.startsWith("http")) ? m : publicUrl(m);
  return null; // host-upload / library only — no synth fallback
}

// HALO Live — a projector-ready slideshow of approved, kept photos.
// Auto-advances with a slow Ken Burns drift, cross-fades between shots,
// polls for new uploads, shows live heart counts, and spotlights the
// admin-pinned "Moment of the Service".
export default function SlideshowPage() {
  const { t, ev, lang } = useI18n();
  const { code } = useParams();
  const [event, setEvent] = useState(null);
  // Per-event look: restyle via CSS variables while this page is mounted.
  useEffect(() => { if (event && event.look) applyLook(event.look); return () => clearLook(); }, [event && event.look]);
  const [photos, setPhotos] = useState([]);
  const hasTwo = photos.length >= 2;
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState(null);
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const [tvOpen, setTvOpen] = useState(false);
  // One-time "tap to go fullscreen" prompt. Browsers only allow fullscreen
  // from a user gesture, so we can't auto-enter it — but a host setting up a
  // TV shouldn't have to hunt for a tiny button that auto-hides. The first tap
  // anywhere requests fullscreen and dismisses this.
  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const [needsTap, setNeedsTap] = useState(() => canFull && !document.fullscreenElement);
  const [counts, setCounts] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const seen = useRef(new Set());
  const chromeTimer = useRef(null);
  const eventRef = useRef(null);
  const audioRef = useRef(null);
  const [musicOn, setMusicOn] = useState(false);
  const [names, setNames] = useState({});          // contributor id -> name
  const [spot, setSpot] = useState(null);          // { photoId, count, name } while shot-of-the-night is up
  const [libTracks, setLibTracks] = useState([]);

  const HOLD = 6500; // ms per photo
  const SPOT_EVERY = 10 * 60 * 1000; // shot-of-the-night cadence
  const SPOT_HOLD = 10000;           // how long it stays up

  // While no photos exist yet, the big screen doubles as the invitation:
  // a large QR to the guest page so the room knows what to do.
  const [joinQr, setJoinQr] = useState("");
  useEffect(() => {
    if (!event || !event.code) return;
    const joinUrl = `${window.location.origin}/e/${event.code}`;
    QRCode.toDataURL(joinUrl, { width: 640, margin: 1, color: { dark: "#16294C", light: "#ffffff" } })
      .then(setJoinQr).catch(() => setJoinQr(""));
  }, [event]);

  // load event + initial photos
  useEffect(() => {
    (async () => {
      const { data: evrow } = await supabase.from("events").select("*").eq("code", code).single();
      setEvent(evrow || false);
      eventRef.current = evrow || null;
      if (evrow) {
        await loadNames(evrow.id);
      }
      const { data: lib } = await supabase.from("music_library").select("*").eq("active", true);
      setLibTracks(lib || []);
      if (evrow) await refresh(evrow.id, true);
      setReady(true);
    })();
  }, [code]);

  // Guest names for "by Name" and the Top Photographers card. Re-read on
  // every refresh so guests who join after the wall opens get credited.
  const loadNames = useCallback(async (eventId) => {
    const { data: people, error } = await supabase.from("contributors").select("id,name").eq("event_id", eventId);
    if (error || !people) return; // keep what we have on a network blip
    const m = {}; people.forEach((c) => { m[c.id] = c.name; });
    // Only replace when something changed, so timers keyed on names don't restart.
    setNames((cur) => (JSON.stringify(cur) === JSON.stringify(m) ? cur : m));
  }, []);

  // Fetch every approved, kept photo (pages of 1000, the API's row cap) and
  // sync the wall with it: new photos slot in right after the one on screen,
  // photos the host hid or deleted drop out, and auto-edited versions replace
  // the originals. Stable identity (no deps) so the realtime channel and the
  // fallback poll are set up once, not torn down on every slide.
  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);
  // One sync at a time: if the poll and a realtime ping overlap, the second
  // one runs right after the first instead of racing it.
  const syncing = useRef(false), again = useRef(false);
  const refresh = useCallback(async (eventId, initial = false) => {
    if (!initial && syncing.current) { again.current = true; return; }
    syncing.current = true;
    try { await syncWall(eventId, initial); } finally { syncing.current = false; }
    if (again.current) { again.current = false; refresh(eventId, false); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const syncWall = useCallback(async (eventId, initial = false) => {
    const session = eventRef.current && eventRef.current.current_session;
    const PAGE = 1000, MAX = 6000;
    let rows = [];
    for (let from = 0; from < MAX; from += PAGE) {
      let q = supabase.from("photos").select("*")
        .eq("event_id", eventId).eq("kept", true).eq("status", "approved");
      if (session) q = q.eq("session_label", session); // V2: current weekly session only
      const { data, error } = await q.order("created_at", { ascending: true }).range(from, from + PAGE - 1);
      if (error) { if (initial) break; return; } // network blip: keep the wall as is
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }
    const mapped = rows.map((p) => ({
      ...p,
      url: p.edited_path ? publicUrl(p.edited_path) : publicUrl(p.storage_path),
      video_url: p.video_path ? publicUrl(p.video_path) : null,
    }));
    if (!initial) loadNames(eventId);
    if (initial) {
      mapped.forEach((p) => seen.current.add(p.id));
      setPhotos(shuffle(mapped));
      return;
    }
    const byId = new Map(mapped.map((p) => [p.id, p]));
    const prev = photosRef.current || [];
    const curId = prev[idxRef.current] && prev[idxRef.current].id;
    // Keep the current order for photos still on the wall, with fresh data.
    const kept = prev.filter((p) => byId.has(p.id)).map((p) => {
      const n = byId.get(p.id);
      return (n.url === p.url && n.video_url === p.video_url && n.updated_at === p.updated_at) ? p : n;
    });
    const fresh = mapped.filter((p) => !seen.current.has(p.id));
    fresh.forEach((p) => seen.current.add(p.id));
    // A photo that was removed and later approved again counts as new.
    const back = mapped.filter((p) => seen.current.has(p.id) && !prev.some((x) => x.id === p.id) && !fresh.includes(p));
    const incoming = [...fresh, ...back];
    const changed = incoming.length || kept.length !== prev.length || kept.some((p, i) => p !== prev[i]);
    if (!changed) return;
    let at = curId ? kept.findIndex((p) => p.id === curId) : -1;
    const next = [...kept];
    if (at === -1) {
      setPrevIdx(null);
      // The photo on screen was removed: show the next one in its place.
      at = Math.min(idxRef.current, Math.max(0, next.length - 1));
      next.splice(at, 0, ...incoming);
    } else {
      next.splice(at + 1, 0, ...incoming);
    }
    photosRef.current = next;
    setPhotos(next);
    setIdx(next.length ? Math.min(at, next.length - 1) : 0);
  }, [loadNames]);

  // New uploads arrive via Supabase Realtime (event-driven, near-instant) so we
  // don't hammer the database with constant polling. A slow 60s fallback poll
  // stays as a safety net in case the realtime socket drops.
  useEffect(() => {
    if (!event) return;

    // 1) Realtime: fire a refresh only when a photo for THIS event changes,
    //    and animate hearts the moment a guest taps one. Bursts (each upload
    //    is an insert then an edit) collapse into one refresh.
    let debounce = null;
    const soon = () => { clearTimeout(debounce); debounce = setTimeout(() => refresh(event.id, false), 1200); };
    const channel = supabase
      .channel(`live-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "photos", filter: `event_id=eq.${event.id}` },
        () => soon()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contributors", filter: `event_id=eq.${event.id}` },
        () => soon()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions", filter: `event_id=eq.${event.id}` },
        (payload) => onHeart(payload.new)
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "wishes", filter: `event_id=eq.${event.id}` },
        (payload) => { const w = payload.new; if (w && w.status === "approved") { setWishes((cur) => [w, ...cur.filter((x) => x.id !== w.id)]); freshWishRef.current.push(w.id); } }
      )
      .subscribe();

    // 2) Fallback poll, just in case the socket silently drops. Also catch up
    //    right away when the TV's network or the tab comes back.
    const tmr = setInterval(() => refresh(event.id, false), 45000);
    const wake = () => { if (document.visibilityState !== "hidden") soon(); };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(tmr);
      clearTimeout(debounce);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [event, refresh]);

  // Keep the TV / laptop screen awake while the wall is open.
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock = null, alive = true;
    const grab = async () => {
      if (document.visibilityState !== "visible") return;
      try { const l = await navigator.wakeLock.request("screen"); if (alive) lock = l; else l.release(); } catch {}
    };
    grab();
    const onVis = () => { if (document.visibilityState === "visible") grab(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); try { lock && lock.release(); } catch {} };
  }, []);

  // keep heart counts fresh as photos arrive (and on first load)
  useEffect(() => {
    if (!event || photos.length === 0) return;
    let alive = true;
    fetchReactions(photos.map((p) => p.id), event.id).then((r) => { if (alive) { setCounts(r.counts); setLiked(r.liked); } }).catch(() => {}); // keep last counts on a blip
    return () => { alive = false; };
  }, [event, photos.length]);

  // ---- Guestbook messages ----
  // Every WISH_EVERY slides, a guest's message gets its own full-screen card
  // for WISH_HOLD. Brand-new messages jump the queue; otherwise they rotate.
  const WISH_EVERY = 5, WISH_HOLD = 9000;
  const [wishes, setWishes] = useState([]);
  const [wishCard, setWishCard] = useState(null);
  const freshWishRef = useRef([]);
  const wishTurnRef = useRef(0);
  const advancesRef = useRef(0);
  useEffect(() => {
    if (!event) return;
    let alive = true;
    const load = () => supabase.from("wishes").select("*").eq("event_id", event.id).eq("status", "approved")
      .order("created_at", { ascending: false }).limit(300)
      .then(({ data }) => { if (alive && data) setWishes(data); });
    load();
    const tmr = setInterval(load, 60000); // safety net if realtime drops
    return () => { alive = false; clearInterval(tmr); };
  }, [event]);
  // ---- Top photographers ----
  // Every BOARD_EVERY slides, a "Top photographers tonight" card shows the
  // five guests with the most photos on the wall. Friendly competition: it
  // reliably gets people shooting more. Needs at least two named guests.
  const BOARD_EVERY = 12, BOARD_HOLD = 9000;
  const [board, setBoard] = useState(null); // [{ name, n }]

  useEffect(() => {
    advancesRef.current += 1;
    if (advancesRef.current % BOARD_EVERY === 0) {
      if (spot) return;
      const tally = {};
      photos.forEach((p) => { const nm = p.contributor_id && names[p.contributor_id]; if (nm && nm !== "Guest") tally[p.contributor_id] = (tally[p.contributor_id] || 0) + 1; });
      const top = Object.entries(tally).map(([id, n]) => ({ name: names[id], n })).sort((a, b) => b.n - a.n).slice(0, 5);
      if (top.length >= 2) { setWishCard(null); setBoard(top); return; }
    }
    if (advancesRef.current % WISH_EVERY !== 0 || !wishes.length || spot) return;
    let w = null;
    while (freshWishRef.current.length && !w) { const id = freshWishRef.current.shift(); w = wishes.find((x) => x.id === id) || null; }
    if (!w) { w = wishes[wishTurnRef.current % wishes.length]; wishTurnRef.current += 1; }
    setWishCard(w);
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // advance timer
  useEffect(() => {
    if (board) {
      const tmr = setTimeout(() => setBoard(null), BOARD_HOLD);
      return () => clearTimeout(tmr);
    }
    if (wishCard) {
      const tmr = setTimeout(() => setWishCard(null), WISH_HOLD);
      return () => clearTimeout(tmr);
    }
    if (paused || !hasTwo) return;
    // Clips play once (up to WALL_SECONDS), then the wall moves on.
    const item = photos[idx];
    const clipMs = item && item.video_url ? Math.min(item.duration || 8, WALL_SECONDS) * 1000 + 900 : 0;
    const tmr = setTimeout(() => go(1), spot ? SPOT_HOLD : (clipMs || HOLD));
    return () => clearTimeout(tmr);
  }, [idx, paused, hasTwo, spot, wishCard, board]); // eslint-disable-line react-hooks/exhaustive-deps
  // Not keyed on photos.length: new uploads arriving must not restart the
  // current slide's timer, or a busy room would freeze the wall on one photo.

  // ---- Shot of the night ----
  // Every 10 minutes, if any photo has hearts, jump to the most-hearted one
  // and hold it with a ribbon naming the guest who took it. Rooms react to
  // this; it also nudges people to heart more.
  const countsRef = useRef(counts); useEffect(() => { countsRef.current = counts; }, [counts]);
  const photosRef = useRef(photos); useEffect(() => { photosRef.current = photos; }, [photos]);
  const namesRef = useRef(names); useEffect(() => { namesRef.current = names; }, [names]);
  useEffect(() => {
    if (!event || !hasTwo) return;
    const tmr = setInterval(() => {
      const list = photosRef.current, c = countsRef.current;
      let best = null, bestN = 0;
      list.forEach((p, i) => { const n = c[p.id] || 0; if (n > bestN) { bestN = n; best = i; } });
      if (best == null || bestN < 1) return;
      const p = list[best];
      setSpot({ photoId: p.id, count: bestN, name: p.contributor_id ? namesRef.current[p.contributor_id] : null });
      setPrevIdx(idxRef.current); setIdx(best);
      setTimeout(() => setSpot(null), SPOT_HOLD);
    }, SPOT_EVERY);
    return () => clearInterval(tmr);
  }, [event, hasTwo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Set up once: refs carry the latest photos, hearts and names, so syncs
  // every 45s no longer restart the 10-minute clock.

  function go(dir) {
    setPhotos((cur) => {
      if (cur.length === 0) return cur;
      setPrevIdx(idx);
      setIdx((i) => (i + dir + cur.length) % cur.length);
      return cur;
    });
  }

  function toggleMusic() {
    const a = audioRef.current;
    if (!a) return;
    if (musicOn) { a.pause(); setMusicOn(false); }
    else { a.volume = 0.6; a.play().then(() => setMusicOn(true)).catch(() => {}); }
  }

  // ---- Live hearts ----
  // A guest's heart arrives over realtime. Bump the count; if it's for the
  // photo on screen right now, float a heart up from the bottom. Hearts for
  // other photos just update their count for the next time they come round.
  const [floaters, setFloaters] = useState([]); // [{id, x, size, hue}]
  const curIdRef = useRef(null);
  useEffect(() => { curIdRef.current = photos[idx]?.id || null; }, [idx, photos]);

  // Tell the room which photo is on screen. Guests' phones listen for their
  // own uploads and show "On the screen now". Broadcast (not DB) so it costs
  // nothing and needs no table. Re-sent on every change and every 5 s so a
  // phone that joins late still catches the current one.
  const showRef = useRef(null);
  useEffect(() => {
    if (!event) return;
    const ch = supabase.channel(`now-${event.id}`, { config: { broadcast: { ack: false } } });
    ch.subscribe((status) => { if (status === "SUBSCRIBED") showRef.current = ch; });
    return () => { showRef.current = null; supabase.removeChannel(ch); };
  }, [event]);
  useEffect(() => {
    const send = () => {
      const p = photos[idx]; const ch = showRef.current;
      if (!p || !ch) return;
      ch.send({ type: "broadcast", event: "showing", payload: { photo_id: p.id, contributor_id: p.contributor_id || null, at: Date.now() } });
    };
    send();
    const t = setInterval(send, 5000);
    return () => clearInterval(t);
  }, [idx, photos]);
  // Each reaction becomes an animated character (heart buddy or thumbs-up
  // buddy). A quick run of reactions on the same photo earns a big one.
  const streakRef = useRef({ n: 0, at: 0 });
  function spawnHearts(n = 1, kind = "heart") {
    const now = Date.now();
    streakRef.current = now - streakRef.current.at < 2500 ? { n: streakRef.current.n + n, at: now } : { n, at: now };
    const big = streakRef.current.n >= 5;
    if (big) streakRef.current = { n: 0, at: now };
    const batch = Array.from({ length: n }, (_, i) => ({
      id: `${now}-${Math.random().toString(36).slice(2)}-${i}`,
      kind,
      big: big && i === n - 1,
      x: 8 + Math.random() * 78,          // vw
      size: 5 + Math.random() * 3,         // vw
      drift: (Math.random() - 0.5) * 14,   // vw sway
      dur: 4.2 + Math.random() * 1.4,      // s
      delay: i * 0.15,
      blink: (Math.random() * 1.8).toFixed(2),
    }));
    setFloaters((f) => [...f, ...batch].slice(-30));
    setTimeout(() => setFloaters((f) => f.filter((h) => !batch.some((b) => b.id === h.id))), 6400);
  }
  const [countPop, setCountPop] = useState(0);
  function onHeart(row) {
    if (!row || !row.photo_id) return;
    if (row.device_id && row.device_id === getDeviceId()) return; // our own tap, already shown
    setCounts((prev) => ({ ...prev, [row.photo_id]: (prev[row.photo_id] || 0) + 1 }));
    if (row.photo_id === curIdRef.current) { spawnHearts(1, row.kind || "heart"); setCountPop((n) => n + 1); }
  }

  async function likeCurrent() {
    const cur = photos[idx];
    if (!cur || !event || liked.has(rxKey(cur.id, "heart"))) return;
    setLiked((prev) => new Set(prev).add(rxKey(cur.id, "heart")));
    setCounts((prev) => ({ ...prev, [cur.id]: (prev[cur.id] || 0) + 1 }));
    spawnHearts(1); setCountPop((n) => n + 1);
    try { await like(cur.id, event.id); } catch { /* keep optimistic */ }
  }

  // keyboard + auto-hide chrome
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key.toLowerCase() === "f") toggleFull();
      else if (e.key.toLowerCase() === "h") likeCurrent();
      wake();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, photos, liked, event]);

  function wake() {
    setShowChrome(true);
    clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => setShowChrome(false), 3500);
    // (the TV sheet keeps the top actions visible on its own via tvOpen)
  }
  useEffect(() => { wake(); return () => clearTimeout(chromeTimer.current); }, []);

  function toggleFull() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
  // Leave the live wall. Drops out of fullscreen first, then goes back to
  // where the host came from. The wall usually opens in its own tab, so try
  // closing that tab, and fall back to the dashboard if the browser says no.
  async function exitWall(e) {
    e?.stopPropagation?.();
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
    if (window.history.length > 1) { window.history.back(); return; }
    try { window.close(); } catch {}
    setTimeout(() => { window.location.assign("/dashboard"); }, 250);
  }
  // Escape (when not in fullscreen, where the browser uses it) also leaves.
  useEffect(() => {
    const onEsc = (e) => { if (e.key === "Escape" && !document.fullscreenElement) exitWall(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);
  // If fullscreen is entered any other way (F key, the Fullscreen button, the
  // browser's own control), retire the prompt too.
  useEffect(() => {
    const onFs = () => { if (document.fullscreenElement) setNeedsTap(false); };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  // First tap anywhere: go fullscreen and retire the prompt.
  function firstTap() {
    if (!needsTap) return;
    setNeedsTap(false);
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch?.(() => {});
  }

  if (!ready) return <Stage><Centered>{t("live.preparing")}</Centered></Stage>;
  if (event === false) return <Stage><Centered>{t("live.notFound")}</Centered></Stage>;
  // Shared one-time fullscreen prompt (see needsTap). Big, centered, obvious.
  const tapPrompt = needsTap ? (
    <div onClick={firstTap} role="button" style={{ position: "absolute", inset: 0, zIndex: 20, display: "grid", placeItems: "center", background: "rgba(5,8,16,.55)", cursor: "pointer" }}>
      <div style={{ textAlign: "center", padding: "3vw 4vw", borderRadius: 24, background: "rgba(11,20,38,.85)", border: `1px solid rgba(255,184,107,.5)`, backdropFilter: "blur(10px)", maxWidth: "70vw" }}>
        <div style={{ fontSize: "5vw", lineHeight: 1, marginBottom: "1.2vw" }} aria-hidden="true">{"⛶"}</div>
        <div className="serif" style={{ color: "#fff", fontSize: "3vw", fontWeight: 700, lineHeight: 1.15 }}>{t("live.tapFull")}</div>
        <div style={{ color: C.gold, fontSize: "1.2vw", letterSpacing: 2, textTransform: "uppercase", marginTop: "1vw" }}>{t("live.tapFullSub")}</div>
      </div>
    </div>
  ) : null;

  if (photos.length === 0) return (
    <Stage onMouseMove={wake} onClick={wake} onTouchStart={wake}>
      {tapPrompt}
      <TopActions show={showChrome || needsTap || tvOpen}>
        <ShowOnTVButton label={t("tvs.btn")} onClick={() => setTvOpen(true)} />
        <ExitButton label={t("live.exit")} onClick={exitWall} />
      </TopActions>
      {tvOpen && <ShowOnTVSheet code={code} onClose={() => { setTvOpen(false); wake(); }} />}
      <Centered>
       <div>
        <div className="serif" style={{ fontSize: "4vw", color: C.text, marginBottom: 6 }}>{ev(event, "name")}</div>
        <div style={{ color: C.gold, fontSize: "1.3vw", letterSpacing: 4, textTransform: "uppercase", marginBottom: "2vh" }}>{t("live.waiting")}</div>
        {joinQr && (
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "1.6vh", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: "3vh 4vw" }}>
            <img src={joinQr} alt="" style={{ width: "min(30vh, 30vw)", height: "min(30vh, 30vw)", borderRadius: 14, display: "block", background: "#fff" }} />
            <div style={{ color: C.text, fontSize: "2.2vw", fontWeight: 800, lineHeight: 1.15 }}>{t("live.scanTitle")}</div>
            <div style={{ color: C.second, fontSize: "1.25vw", lineHeight: 1.4 }}>{t("live.scanSub")}</div>
          </div>
        )}
       </div>
      </Centered>
    </Stage>
  );

  const cur = photos[idx];
  const prev = prevIdx != null ? photos[prevIdx] : null;
  let musicSrc = null;
  if (event) {
    if (event.music_url) { musicSrc = resolveMusic(event); }
    else {
      const mood = CAT_MOOD[event.category];
      const hit = mood && libTracks.find((x) => x.mood === mood);
      musicSrc = hit ? publicUrl(hit.storage_path) : resolveMusic(event);
    }
  }
  const isMoment = event && event.featured_photo_id && cur.id === event.featured_photo_id;
  const curCount = counts[cur.id] || 0;
  const curLiked = liked.has(rxKey(cur.id, "heart"));

  return (
    <Stage onMouseMove={wake} onClick={wake} onTouchStart={wake}>
      {tapPrompt}
      <TopActions show={showChrome || needsTap || tvOpen}>
        <ShowOnTVButton label={t("tvs.btn")} onClick={() => setTvOpen(true)} />
        <ExitButton label={t("live.exit")} onClick={exitWall} />
      </TopActions>
      {tvOpen && <ShowOnTVSheet code={code} onClose={() => { setTvOpen(false); wake(); }} />}

      {musicSrc && <audio ref={audioRef} src={musicSrc} loop preload="auto" />}
      {prev && prev.id !== cur.id && (
        <Frame key={"p" + prev.id + idx} src={prev.url} variant={prevIdx % 3} fading still={!!prev.video_url} />
      )}
      {cur.video_url
        ? <ClipFrame key={"v" + cur.id + idx} src={cur.video_url} poster={cur.url} onDone={() => { if (!paused && photos.length > 1) go(1); }} />
        : <Frame key={"c" + cur.id + idx} src={cur.url} variant={idx % 3} />}
      {cur.video_url && (
        <div style={{ position: "absolute", right: "2.2vw", bottom: "2.4vw", display: "flex", alignItems: "center", gap: ".6vw", background: "rgba(10,4,16,.6)", color: "#fff", padding: ".5vw 1vw", borderRadius: 999, fontSize: "1.05vw", fontWeight: 700, backdropFilter: "blur(6px)", pointerEvents: "none", opacity: showChrome ? 0 : 1, transition: "opacity .6s ease" }}>
          <svg viewBox="0 0 24 24" width="1.3em" height="1.3em" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6.5" width="12.5" height="11" rx="2" /><path d="m15.5 10.5 5-3v9l-5-3" /></svg>
          <span style={{ letterSpacing: ".12em" }}>{t("live.video")}</span>
          {cur.contributor_id && names[cur.contributor_id] ? <span style={{ fontWeight: 500, opacity: .9 }}>{t("live.by")} {names[cur.contributor_id]}</span> : null}
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, transparent 55%, rgba(11,20,38,.6) 100%)", pointerEvents: "none" }} />

      {/* Animated reaction characters: one per guest heart or like on the photo currently showing */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {floaters.map((h) => (
          <div key={h.id} className={"rx-float" + (h.big ? " rx-big" : "")} style={{ left: `${h.x}vw`, width: `${h.big ? h.size * 2 : h.size}vw`, height: `${h.big ? h.size * 2 : h.size}vw`, "--drift": `${h.drift}vw`, "--dur": `${h.big ? h.dur + 1 : h.dur}s`, "--blink": `${h.blink}s`, animationDelay: `${h.delay}s` }}>
            <ReactionBuddy kind={h.kind} big={h.big} />
          </div>
        ))}
      </div>

      {/* Always-on brand corner: the event's name (and cover as a badge) so
          every photo someone takes of the screen carries the couple's or the
          church's name. Fades while the full controls are showing. */}
      <div style={{ position: "absolute", top: "2.4vw", left: "2.2vw", display: "flex", alignItems: "center", gap: ".8vw", pointerEvents: "none", opacity: showChrome ? 0 : 1, transition: "opacity .6s ease" }}>
        {event.cover_path ? (
          <img src={publicUrl(event.cover_path)} alt="" style={{ width: "max(3.2vw, 30px)", height: "max(3.2vw, 30px)", borderRadius: "50%", objectFit: "cover", objectPosition: `${Math.round((event.cover_focus_x ?? 0.5) * 100)}% ${Math.round((event.cover_focus_y ?? 0.5) * 100)}%`, border: `2px solid ${C.gold}`, boxShadow: "0 4px 14px rgba(0,0,0,.45)" }} />
        ) : (
          <span style={{ width: "max(3.2vw, 30px)", height: "max(3.2vw, 30px)", borderRadius: "50%", border: `2px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontSize: "1.4vw" }}>&#9673;</span>
        )}
        <div>
          <div className="serif" style={{ color: "#fff", fontSize: "max(1.5vw, 13px)", lineHeight: 1.05, fontWeight: 700, textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{ev(event, "name")}</div>
          {ev(event, "event_date") && <div style={{ color: C.gold, fontSize: "max(.8vw, 9px)", letterSpacing: 2, textTransform: "uppercase", marginTop: ".2vw", textShadow: "0 2px 8px rgba(0,0,0,.6)" }}>{ev(event, "event_date")}</div>}
        </div>
      </div>

      {/* Always-on room stats: photos and guests so far. Makes the wall feel
          alive and nudges the people who haven't scanned yet. */}
      {(() => {
        const guests = new Set(photos.map((p) => p.contributor_id).filter(Boolean)).size;
        return (
          <div style={{ position: "absolute", left: "2.2vw", bottom: "2.2vw", display: "flex", alignItems: "center", gap: ".9vw", background: "rgba(10,4,16,.55)", color: "#fff", padding: ".5vw 1.1vw", borderRadius: 999, fontSize: "1vw", fontWeight: 700, backdropFilter: "blur(6px)", pointerEvents: "none", opacity: showChrome ? 0 : 1, transition: "opacity .6s ease" }}>
            <span>{photos.length} {photos.length === 1 ? t("live.photoWord") : t("live.photosWord")}</span>
            <span style={{ opacity: .5 }}>·</span>
            <span>{guests} {guests === 1 ? t("live.guestWord") : t("live.guestsWord")}</span>
          </div>
        );
      })()}

      {/* Always-on heart count for the photo on screen (pops when it changes) */}
      {curCount > 0 && (
        <div key={countPop} style={{ position: "absolute", right: "2.2vw", top: "2.4vw", display: "flex", alignItems: "center", gap: ".5vw", background: "rgba(10,4,16,.55)", color: "#fff", padding: ".55vw 1.1vw", borderRadius: 999, fontSize: "1.3vw", fontWeight: 800, backdropFilter: "blur(6px)", animation: "countPop .45s ease-out", pointerEvents: "none" }}>
          <svg viewBox="0 0 24 24" style={{ width: "1.4vw", height: "1.4vw" }}><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.6 5.3 5.9 4.6c2-.4 4 .5 6.1 2.6 2.1-2.1 4.1-3 6.1-2.6 3.3.7 5 4 3.5 7.3C19.5 16.4 12 21 12 21z" fill={C.pink} /></svg>
          {curCount}
        </div>
      )}

      {/* Shot of the night ribbon (every 10 min, most-hearted photo) */}
      {spot && spot.photoId === cur.id && (
        <div style={{ position: "absolute", top: "4vh", left: "50%", transform: "translateX(-50%)", textAlign: "center", animation: "countPop .5s ease-out" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: ".6vw", background: C.gold, color: C.ink, padding: ".55vw 1.8vw", borderRadius: 999, fontSize: "1.15vw", fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
            <svg viewBox="0 0 24 24" style={{ width: "1.3vw", height: "1.3vw" }}><path d="M12 21s-7.5-4.6-9.6-9.1C.9 8.6 2.6 5.3 5.9 4.6c2-.4 4 .5 6.1 2.6 2.1-2.1 4.1-3 6.1-2.6 3.3.7 5 4 3.5 7.3C19.5 16.4 12 21 12 21z" fill={C.pink} /></svg>
            {t("live.shotOfNight")} · {spot.count}
          </div>
          {spot.name && spot.name !== "Guest" && (
            <div style={{ marginTop: ".6vw", color: "#fff", fontSize: "1.1vw", textShadow: "0 2px 10px rgba(0,0,0,.6)" }}>{t("live.by")} {spot.name}</div>
          )}
        </div>
      )}

      {/* Photo challenge lower-third: which prompt this shot answers, and who took it */}
      {(() => {
        if (!cur.challenge) return null;
        const c = challengesFor(event).find((x) => x.id === cur.challenge);
        if (!c) return null;
        const who = cur.contributor_id && names[cur.contributor_id] && names[cur.contributor_id] !== "Guest" ? names[cur.contributor_id] : null;
        return (
          <div key={"ch" + cur.id} style={{ position: "absolute", left: "50%", bottom: "6vh", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none", animation: "chIn .7s cubic-bezier(.2,.9,.3,1.2) both", maxWidth: "70vw" }}>
            <div style={{ display: "inline-block", background: "rgba(10,4,16,.66)", border: `1px solid ${C.gold}`, borderRadius: 18, padding: "1vw 2vw", backdropFilter: "blur(8px)", boxShadow: "0 10px 34px rgba(0,0,0,.45)" }}>
              <div style={{ color: C.gold, fontSize: ".9vw", fontWeight: 800, letterSpacing: ".3em", textTransform: "uppercase" }}>{t("live.challenge")}</div>
              <div className="serif" style={{ color: "#fff", fontSize: "2.1vw", fontWeight: 700, lineHeight: 1.15, marginTop: ".3vw" }}>{challengeText(c, lang)}</div>
              {who && <div style={{ color: "rgba(255,255,255,.85)", fontSize: "1.05vw", marginTop: ".35vw" }}>{t("live.by")} {who}</div>}
            </div>
          </div>
        );
      })()}

      {/* Top photographers card */}
      {board && (
        <div key="board" style={{ position: "absolute", inset: 0, zIndex: 5, display: "grid", placeItems: "center", background: "radial-gradient(ellipse at center, rgba(10,4,16,.7), rgba(10,4,16,.93))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", animation: "fadeIn .9s ease", pointerEvents: "none" }}>
          <div style={{ width: "min(56vw, 900px)", textAlign: "center" }}>
            <div style={{ color: C.gold, fontSize: "1.1vw", fontWeight: 800, letterSpacing: ".35em", textTransform: "uppercase" }}>{t("live.boardEyebrow")}</div>
            <div className="serif" style={{ color: "#fff", fontSize: "3.6vw", fontWeight: 700, lineHeight: 1.1, margin: ".6vw 0 2.2vw" }}>{t("live.boardTitle")}</div>
            <div style={{ display: "grid", gap: ".9vw" }}>
              {board.map((r, i) => (
                <div key={r.name + i} style={{ display: "flex", alignItems: "center", gap: "1.4vw", background: i === 0 ? "rgba(255,184,107,.16)" : "rgba(255,255,255,.06)", border: `1px solid ${i === 0 ? C.gold : "rgba(255,255,255,.14)"}`, borderRadius: "1.2vw", padding: "1vw 1.6vw", animation: `boardIn .6s cubic-bezier(.2,.9,.3,1.2) ${0.25 + i * 0.12}s both` }}>
                  <div style={{ width: "3vw", height: "3vw", flex: "0 0 auto", borderRadius: "50%", display: "grid", placeItems: "center", background: i === 0 ? C.gold : "rgba(255,255,255,.12)", color: i === 0 ? "#1a0f0a" : "#fff", fontWeight: 800, fontSize: "1.5vw" }}>{i + 1}</div>
                  <div style={{ flex: 1, textAlign: "left", color: "#fff", fontSize: "1.9vw", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ color: i === 0 ? C.gold : "rgba(255,255,255,.85)", fontSize: "1.6vw", fontWeight: 800 }}>{r.n} <span style={{ fontSize: "1vw", fontWeight: 600, opacity: .8 }}>{r.n === 1 ? t("live.boardPhoto") : t("live.boardPhotos")}</span></div>
                </div>
              ))}
            </div>
            <div style={{ color: "rgba(255,255,255,.75)", fontSize: "1.15vw", marginTop: "2vw" }}>{t("live.boardSub")}</div>
          </div>
        </div>
      )}

      {/* Guestbook message card */}
      {wishCard && (
        <div key={"w" + wishCard.id} style={{ position: "absolute", inset: 0, zIndex: 5, display: "grid", placeItems: "center", background: "radial-gradient(ellipse at center, rgba(10,4,16,.72), rgba(10,4,16,.92))", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", animation: "fadeIn .9s ease", pointerEvents: "none" }}>
          <div style={{ maxWidth: "62vw", textAlign: "center", padding: "0 4vw" }}>
            <svg viewBox="0 0 48 36" style={{ width: "4.2vw", height: "auto", opacity: .9 }} aria-hidden="true"><path d="M0 36V22C0 9.5 6.5 2 19 0l2 5c-7 2-10.5 6-11 12h9v19H0Zm27 0V22C27 9.5 33.5 2 46 0l2 5c-7 2-10.5 6-11 12h9v19H27Z" fill={C.gold} /></svg>
            <div className="serif" style={{ color: "#fff", fontSize: wishCard.message.length > 160 ? "2.6vw" : wishCard.message.length > 80 ? "3.2vw" : "3.9vw", lineHeight: 1.3, fontWeight: 600, marginTop: "1.6vw", textShadow: "0 2px 18px rgba(0,0,0,.45)", overflowWrap: "anywhere" }}>{wishCard.message}</div>
            <div style={{ marginTop: "2vw", color: C.gold, fontSize: "1.3vw", fontWeight: 700, letterSpacing: ".08em" }}>
              {wishCard.name ? `${t("live.wishFrom")} ${wishCard.name}` : t("live.wishAnon")}
            </div>
          </div>
        </div>
      )}

      {/* Moment of the Service ribbon */}
      {isMoment && !(spot && spot.photoId === cur.id) && (
        <div style={{ position: "absolute", top: "4vh", left: "50%", transform: "translateX(-50%)", background: C.gold, color: C.ink, padding: ".5vw 1.6vw", borderRadius: 999, fontSize: "1.1vw", fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
          {t("live.moment")}
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: showChrome ? 1 : 0, transition: "opacity .6s ease" }}>
        <div style={{ position: "absolute", top: "4vh", left: "4vw", display: "flex", alignItems: "center", gap: 14 }}>
          <img src="/halo-logo.png" alt="HALO" style={{ height: "3vw", width: "auto", display: "block" }} />
          <div>
            <div className="serif" style={{ color: "#fff", fontSize: "1.9vw", lineHeight: 1, fontWeight: 700 }}>{ev(event, "name")}</div>
            <div style={{ color: C.gold, fontSize: ".8vw", letterSpacing: 3, textTransform: "uppercase", marginTop: 4 }}>HALO Live</div>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "4vh", left: "4vw", right: "4vw", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ color: "#fff", fontSize: ".95vw", opacity: .85 }}>
            {idx + 1} / {photos.length}{paused ? ` · ${t("live.paused")}` : ""}
          </div>
          <div />
          <div style={{ display: "flex", gap: 10, pointerEvents: "auto", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={likeCurrent} aria-label={t("react.heart")} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(242,236,228,.12)", color: "#fff", border: `1px solid rgba(242,236,228,.3)`, padding: "max(.7vw, 9px) max(1.1vw, 13px)", borderRadius: 999, fontSize: "max(.9vw, 13px)", backdropFilter: "blur(6px)" }}>
              <svg width="1.1vw" height="1.1vw" viewBox="0 0 24 24" fill={curLiked ? C.gold : "none"} stroke={curLiked ? C.gold : C.white} strokeWidth="2" style={{ width: "max(1.1vw, 16px)", height: "max(1.1vw, 16px)" }}>
                <path d="M12 21s-7.5-4.6-10-9.2C.7 9 1.6 5.6 4.6 4.7 6.7 4 8.8 4.9 12 8c3.2-3.1 5.3-4 7.4-3.3 3 .9 3.9 4.3 2.6 7.1C19.5 16.4 12 21 12 21z" />
              </svg>
              {curCount > 0 && <span>{curCount}</span>}
            </button>
{musicSrc && <Ctrl onClick={toggleMusic}>{musicOn ? t("live.musicOff") : t("live.musicOn")}</Ctrl>}
            <Ctrl onClick={() => setPaused((p) => !p)}>{paused ? t("live.play") : t("live.pause")}</Ctrl>
            {canFull && <Ctrl onClick={toggleFull}>{t("live.fullscreen")}</Ctrl>}
          </div>
        </div>

        {!paused && (
          <div key={idx} style={{ position: "absolute", bottom: 0, left: 0, height: 4, background: C.gold, animation: `grow ${HOLD}ms linear` }} />
        )}
      </div>

      <style>{`
        @keyframes grow { from { width: 0 } to { width: 100% } }
        ${LIVE_REACTION_CSS}
        @keyframes boardIn { from { opacity: 0; transform: translateY(1.4vw) scale(.97) } to { opacity: 1; transform: none } }
        @keyframes chIn { from { opacity: 0; transform: translate(-50%, 2vh) scale(.96) } to { opacity: 1; transform: translate(-50%, 0) scale(1) } }
        @keyframes countPop { 0% { transform: scale(1) } 35% { transform: scale(1.28) } 100% { transform: scale(1) } }
        @keyframes kb0 { from { transform: scale(1.04) translate(0,0) } to { transform: scale(1.15) translate(-2%, -1.5%) } }
        @keyframes kb1 { from { transform: scale(1.15) translate(-2%, 1.5%) } to { transform: scale(1.04) translate(0,0) } }
        @keyframes kb2 { from { transform: scale(1.05) translate(1.5%, 1%) } to { transform: scale(1.16) translate(-1.5%, -1.5%) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          .kb-img { animation: fadeIn .8s ease !important; }
        }
      `}</style>
    </Stage>
  );
}

function Frame({ src, fading, variant = 0, still = false }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", animation: fading ? "none" : "fadeIn 1s ease", opacity: fading ? 0 : 1, transition: "opacity 1s ease" }}>
      <img className="kb-img" src={src} alt=""
        style={{ width: "100%", height: "100%", objectFit: "cover", animation: still ? "none" : `kb${variant} 8s ease-out forwards`, willChange: "transform" }} />
    </div>
  );
}

// A guest's clip on the wall: muted (the music keeps playing), plays once up
// to WALL_SECONDS. Phone clips are often vertical, so the clip sits whole in
// the middle over a soft blurred copy of its own frame instead of being
// cropped. If the TV can't play the format, its still frame stays up instead.
function ClipFrame({ src, poster, onDone }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const v = ref.current; if (!v) return;
    v.muted = true;
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }, []);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", animation: "fadeIn 1s ease", background: "#000" }}>
      <img src={poster} alt="" style={{ position: "absolute", inset: "-6%", width: "112%", height: "112%", objectFit: "cover", filter: "blur(28px) brightness(.55)" }} />
      {failed ? (
        <img src={poster} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      ) : (
        <video ref={ref} src={src} poster={poster} muted autoPlay playsInline preload="auto"
          onError={() => setFailed(true)}
          onEnded={onDone}
          onTimeUpdate={(e) => { if (e.currentTarget.currentTime >= WALL_SECONDS) { e.currentTarget.pause(); onDone && onDone(); } }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
      )}
    </div>
  );
}

function Stage({ children, ...rest }) {
  return (
    <div {...rest} style={{ position: "fixed", inset: 0, background: C.inkDeep, overflow: "hidden", cursor: "default" }}>
      {children}
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", color: C.text, fontSize: "1.6vw" }}>{children}</div>;
}

// Top-right actions on the live wall (Show on TV, Exit): thumb-sized on
// phones, fade with the rest of the controls, come back on any tap.
function TopActions({ show, children }) {
  return (
    <div style={{ position: "absolute", zIndex: 30, top: "calc(max(2.4vh, 12px) + env(safe-area-inset-top, 0px))", right: "calc(max(2vw, 12px) + env(safe-area-inset-right, 0px))",
      display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "calc(100vw - 24px)",
      opacity: show ? 1 : 0, pointerEvents: show ? "auto" : "none", transition: "opacity .6s ease" }}>
      {children}
    </div>
  );
}

function ExitButton({ label, onClick }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(e); }} aria-label={label} style={pillBtn}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      {label}
    </button>
  );
}

function Ctrl({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "rgba(242,236,228,.12)", color: "#fff", border: `1px solid rgba(242,236,228,.3)`, padding: "max(.7vw, 9px) max(1.2vw, 14px)", borderRadius: 999, fontSize: "max(.9vw, 13px)", fontWeight: 600, backdropFilter: "blur(6px)" }}>
      {children}
    </button>
  );
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
