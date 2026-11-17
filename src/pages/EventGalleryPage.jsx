// HALO — the shareable, event-wide gallery: /gallery/:code
//
// One link the host (or any guest) can send to anyone. It shows every kept +
// approved photo from the event (the same set as the guest Gallery tab and the
// live screen, so anything held for review or flagged stays out). It uses the
// same "Story" album look as the private album (/album/:key): tap any photo
// to see it big, swipe, save, share, slideshow with the event's music, save
// all. On top of that, guests can heart photos and jump to "Add your photos".
// No name or upload step in the way.
import React, { useEffect, useState } from "react";
import { RETAIN_DAYS, expiryFor } from "../lib/retention.js";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { fetchReactions, like, rxKey } from "../lib/reactions.js";
import { useI18n } from "../lib/i18n.jsx";
import { notMessage } from "../lib/videoMessage.js";
import { galleryUrlFor } from "../lib/share.js";
import { musicFor } from "../lib/music.js";
import AlbumView, { AlbumCenter, AlbumLoading } from "../components/album/AlbumView.jsx";

const musicUrl = (m) => (!m ? null : (m.startsWith("/") || m.startsWith("http")) ? m : publicUrl(m));

export default function EventGalleryPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [event, setEvent] = useState(null);     // null loading | false missing | row
  const [failed, setFailed] = useState(false);
  const [tryN, setTryN] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [music, setMusic] = useState(null);
  const [kinds, setKinds] = useState({});
  const [liked, setLiked] = useState(() => new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      setFailed(false); setEvent(null);
      const res = await supabase.from("events").select("*").eq("code", code).maybeSingle();
      if (!alive) return;
      if (res.error) { setFailed(true); return; }
      if (!res.data) { setEvent(false); return; }
      const evrow = res.data;
      let q = supabase.from("photos").select("*")
        .eq("event_id", evrow.id).eq("kept", true).eq("status", "approved");
      if (evrow.current_session) q = q.eq("session_label", evrow.current_session);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
      if (!alive) return;
      if (error) { setFailed(true); return; }
      const rows = (data || []).filter(notMessage).map((p) => ({
        ...p,
        url: publicUrl(p.storage_path),
        edited_url: p.edited_path ? publicUrl(p.edited_path) : null,
        video_url: p.video_path ? publicUrl(p.video_path) : null,
      }));
      setEvent(evrow);
      setPhotos(rows);
      // Slideshow music: same pick as the live screen. Optional.
      try {
        let tracks = [];
        if (!evrow.music_url) {
          const { data: lib } = await supabase.from("music_library").select("*").eq("active", true);
          tracks = lib || [];
        }
        if (alive) setMusic(musicUrl(musicFor(evrow, tracks)));
      } catch { /* no music */ }
      try {
        const r = await fetchReactions(rows.map((p) => p.id));
        if (alive) { setKinds(r.kinds || {}); setLiked(r.liked || new Set()); }
      } catch { /* hearts are optional */ }
    })();
    return () => { alive = false; };
  }, [code, tryN]);

  async function onLike(photoId, kind = "heart") {
    const key = rxKey(photoId, kind);
    if (liked.has(key)) return;
    setLiked((prev) => new Set(prev).add(key));
    setKinds((prev) => ({ ...prev, [photoId]: { ...(prev[photoId] || {}), [kind]: ((prev[photoId] || {})[kind] || 0) + 1 } }));
    try { await like(photoId, event.id, kind); } catch { /* keep optimistic */ }
  }

  if (failed) return (
    <AlbumCenter>
      <p className="alb-msg">{t("sg.loadFailed")}</p>
      <button type="button" className="btn-gold" onClick={() => setTryN((n) => n + 1)}>{t("sg.tryAgain")}</button>
    </AlbumCenter>
  );
  if (event === null) return <AlbumLoading text={t("sg.loading")} />;
  if (event === false) return (
    <AlbumCenter>
      <h1 className="serif" style={{ fontSize: 30, margin: "0 0 8px" }}>{t("sg.notFound.title")}</h1>
      <p className="alb-msg">{t("sg.notFound.sub")}</p>
      <button type="button" className="btn-gold" onClick={() => navigate("/")}>{t("gal.goHome")}</button>
    </AlbumCenter>
  );
  if (event.closed_at) return (
    <AlbumCenter>
      <h1 className="serif" style={{ fontSize: 30, margin: "0 0 8px" }}>{t("ret.guestClosedTitle")}</h1>
      <p className="alb-msg">{t("ret.guestClosedSub").replace("{n}", RETAIN_DAYS)}</p>
    </AlbumCenter>
  );

  const until = photos.length ? expiryFor(event, null) : null;

  return (
    <AlbumView
      event={event}
      items={photos}
      until={until ? new Date(until).toISOString() : null}
      music={music}
      shareUrl={galleryUrlFor(event.code)}
      shareTextKey="sg.shareText" copiedKey="sg.copied" copyFailedKey="sg.copyFailed"
      kickerKey="sg.kicker" emptyKeys={["sg.empty.title", "sg.empty.sub"]}
      shareLabelKey="sg.share" untilKey="ret.guestUntil"
      hearts={{ kinds, liked, onLike }}
      addYoursHref={`/e/${encodeURIComponent(event.code)}`}
    />
  );
}
