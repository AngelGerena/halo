import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { Header, Footer, Spinner, Empty } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { fetchReactions, like } from "../lib/reactions.js";
import { useI18n } from "../lib/i18n.jsx";
import { frameFor } from "../lib/frames.js";
import { applyLook, clearLook } from "../lib/looks.js";
import { useSiteThemeKey } from "../lib/siteTheme.js";
import { notMessage } from "../lib/videoMessage.js";

export default function GalleryPage() {
  const { contributorId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [contributor, setContributor] = useState(null);
  const [event, setEvent] = useState(null);
  const siteLook = useSiteThemeKey();
  useEffect(() => { applyLook((event && event.look) || siteLook); return () => clearLook(); }, [event && event.look, siteLook]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({});
  const [liked, setLiked] = useState(() => new Set());

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from("contributors").select("id,event_id,name,created_at").eq("id", contributorId).single();
      setContributor(c || false);
      if (c) {
        // The event's frame (if any) so saved photos carry it. Optional: a
        // failed read just means plain photos.
        try { const { data: ev } = await supabase.from("events").select("*").eq("id", c.event_id).maybeSingle(); setEvent(ev || null); } catch { /* plain photos */ }
        const { data } = await supabase.from("photos").select("*")
          .eq("contributor_id", contributorId).eq("kept", true).eq("status", "approved")
          .order("created_at", { ascending: false });
        const mapped = (data || []).filter(notMessage).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null, video_url: p.video_path ? publicUrl(p.video_path) : null }));
        setPhotos(mapped);
        const r = await fetchReactions(mapped.map((p) => p.id));
        setCounts(r.counts); setLiked(r.liked);
      }
      setLoading(false);
    })();
  }, [contributorId]);

  async function onLike(photoId) {
    if (liked.has(photoId) || !contributor) return;
    setLiked((prev) => new Set(prev).add(photoId));
    setCounts((prev) => ({ ...prev, [photoId]: (prev[photoId] || 0) + 1 }));
    try { await like(photoId, contributor.event_id); } catch { /* keep optimistic */ }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1 }}>
        {loading ? <Spinner label={t("gal.loading")} /> :
          !contributor ? <Empty title={t("gal.notFound.title")} sub={t("gal.notFound.sub")} action={t("gal.goHome")} onAction={() => navigate("/")} /> :
          <>
            <h1 className="serif" style={{ fontSize: 34, color: C.text, marginBottom: 2 }}>{t("gal.titlePrefix")}{contributor.name}{t("gal.titleSuffix")}</h1>
            <p style={{ color: C.second, marginTop: 0 }}>{photos.length} {photos.length === 1 ? t("gal.curatedPhoto") : t("gal.curatedPhotos")}</p>
            {photos.length === 0 ? <Empty title={t("gal.empty.title")} sub={t("gal.empty.sub")} /> : <PhotoGrid photos={photos} dimUnkept={false} counts={counts} liked={liked} onLike={onLike} frame={frameFor(event)} eventCode={event?.code || ""} />}
          </>}
      </main>
      <Footer />
    </div>
  );
}
