// HALO — the Album: /album/:key
//
// The simple, view-only place for the photos after the event. Co-hosts land
// here once the event is over, and anyone they send the link to sees the
// same thing. No account, no login, no host tools. Oldest photo first so it
// reads like the night. The look itself lives in components/album/AlbumView.
//
// The key is a signed token (netlify/functions/_album.js), so the link can't
// be guessed from the event code. Data comes from the album function.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { publicUrl } from "../lib/supabase.js";
import { useI18n } from "../lib/i18n.jsx";
import AlbumView, { AlbumCenter, AlbumLoading } from "../components/album/AlbumView.jsx";

const musicUrl = (m) => (!m ? null : (m.startsWith("/") || m.startsWith("http")) ? m : publicUrl(m));

export default function AlbumPage() {
  const { key } = useParams();
  const { t } = useI18n();
  const [state, setState] = useState({ status: "loading" }); // loading | ready | missing | closed | failed
  const [tryN, setTryN] = useState(0);

  // Private page: keep it out of search engines.
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex, nofollow";
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const r = await fetch(`/.netlify/functions/album?k=${encodeURIComponent(key || "")}`, { cache: "no-store" });
        if (!alive) return;
        if (r.status === 404) { setState({ status: "missing" }); return; }
        if (r.status === 410) { setState({ status: "closed" }); return; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const items = (j.photos || []).map((p) => ({
          ...p,
          url: publicUrl(p.storage_path),
          edited_url: p.edited_path ? publicUrl(p.edited_path) : null,
          video_url: p.video_path ? publicUrl(p.video_path) : null,
        }));
        if (alive) setState({ status: "ready", event: j.event || {}, items, until: j.until, music: musicUrl(j.music) });
      } catch {
        if (alive) setState({ status: "failed" });
      }
    })();
    return () => { alive = false; };
  }, [key, tryN]);

  if (state.status === "loading") return <AlbumLoading text={t("alb.loading")} />;
  if (state.status === "failed") return (
    <AlbumCenter>
      <p className="alb-msg">{t("alb.failed")}</p>
      <button type="button" className="btn-gold" onClick={() => setTryN((n) => n + 1)}>{t("alb.retry")}</button>
    </AlbumCenter>
  );
  if (state.status === "missing" || state.status === "closed") return (
    <AlbumCenter>
      <h1 className="serif" style={{ fontSize: 30, margin: "0 0 8px" }}>{t(state.status === "missing" ? "alb.notFound.title" : "alb.closed.title")}</h1>
      <p className="alb-msg">{t(state.status === "missing" ? "alb.notFound.sub" : "alb.closed.sub")}</p>
    </AlbumCenter>
  );

  return (
    <AlbumView event={state.event} items={state.items} until={state.until} music={state.music}
      shareUrl={`${window.location.origin}/album/${key}`} />
  );
}
