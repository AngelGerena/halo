// HALO — the shareable, event-wide gallery: /gallery/:code
//
// One link the host (or any guest) can send to anyone. It shows every kept +
// approved photo from the event (the same set as the guest Gallery tab and the
// live screen, so anything held for review or flagged stays out), with hearts,
// a Share button and a Download-all ZIP. No name or upload step in the way.
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { Footer, LangToggle } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { fetchReactions, like, rxKey } from "../lib/reactions.js";
import { useI18n } from "../lib/i18n.jsx";
import { frameFor } from "../lib/frames.js";
import { applyLook, clearLook } from "../lib/looks.js";
import { useSiteThemeKey } from "../lib/siteTheme.js";
import { notMessage } from "../lib/videoMessage.js";
import { formatEventDate } from "../lib/eventDate.js";
import { shareLink, galleryUrlFor } from "../lib/share.js";
import { downloadZip } from "../lib/zipDownload.js";

export default function EventGalleryPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { t, ev, lang } = useI18n();
  const siteLook = useSiteThemeKey();
  useEffect(() => { applyLook(siteLook); return () => clearLook(); }, [siteLook]); // eslint-disable-line react-hooks/exhaustive-deps

  const [event, setEvent] = useState(null);     // null loading | false missing | row
  const [failed, setFailed] = useState(false);
  const [tryN, setTryN] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [kinds, setKinds] = useState({});
  const [liked, setLiked] = useState(() => new Set());
  const [note, setNote] = useState("");
  const [zipping, setZipping] = useState(null); // null | { done, total }

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
      try {
        const r = await fetchReactions(rows.map((p) => p.id));
        if (alive) { setKinds(r.kinds || {}); setLiked(r.liked || new Set()); }
      } catch { /* hearts are optional */ }
    })();
    return () => { alive = false; };
  }, [code, tryN]);

  // Tab title + link previews for this page.
  useEffect(() => {
    if (event && event.name) document.title = `${ev(event, "name")} · HALO`;
  }, [event, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  function flash(msg) { setNote(msg); clearTimeout(window.__haloSgT); window.__haloSgT = setTimeout(() => setNote(""), 2600); }

  async function onShare() {
    const name = ev(event, "name");
    const r = await shareLink({ url: galleryUrlFor(event.code), title: name, text: t("sg.shareText").replace("{name}", name) });
    if (r === "copied") flash(t("sg.copied"));
    else if (r === "failed") flash(t("sg.copyFailed"));
  }

  async function onLike(photoId, kind = "heart") {
    const key = rxKey(photoId, kind);
    if (liked.has(key)) return;
    setLiked((prev) => new Set(prev).add(key));
    setKinds((prev) => ({ ...prev, [photoId]: { ...(prev[photoId] || {}), [kind]: ((prev[photoId] || {})[kind] || 0) + 1 } }));
    try { await like(photoId, event.id, kind); } catch { /* keep optimistic */ }
  }

  async function onDownload() {
    if (zipping || !photos.length) return;
    setZipping({ done: 0, total: photos.length });
    try {
      const items = photos.map((p, i) => {
        const n = String(i + 1).padStart(3, "0");
        if (p.video_url) {
          const ext = (String(p.video_path).match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1];
          return { url: p.video_url, name: `HALO_${event.code}_${n}.${ext}` };
        }
        return { url: p.edited_url || p.url, name: `HALO_${event.code}_${n}.jpg` };
      });
      const slug = String(event.name || event.code).replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      const { missing } = await downloadZip(items, `HALO_${slug || event.code}_${items.length}-photos.zip`, (done, total) => setZipping({ done, total }));
      if (missing && missing.length) flash(t("sg.zipMissing").replace("{n}", missing.length));
    } catch { flash(t("sg.zipFailed")); }
    finally { setZipping(null); }
  }

  const shell = (inner) => (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", color: C.text,
      background: "radial-gradient(130% 70% at 50% -10%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 55%), var(--page, var(--ink, #0a0410))" }}>
      <main style={{ flex: 1 }}>{inner}</main>
      <Footer />
    </div>
  );

  if (failed) return shell(
    <div style={S.center}><div>
      <p style={{ color: C.second, maxWidth: 340, margin: "0 auto 18px" }}>{t("sg.loadFailed")}</p>
      <button className="btn-gold" onClick={() => setTryN((n) => n + 1)}>{t("sg.tryAgain")}</button>
    </div></div>
  );
  if (event === null) return shell(
    <div style={S.center}><div style={{ display: "flex", alignItems: "center", gap: 10, color: C.second }}>
      <span className="spin" style={S.spin} /> {t("sg.loading")}
    </div></div>
  );
  if (event === false) return shell(
    <div style={S.center}><div>
      <h1 className="serif" style={{ fontSize: 30, margin: "0 0 8px" }}>{t("sg.notFound.title")}</h1>
      <p style={{ color: C.second, maxWidth: 320, margin: "0 auto 20px" }}>{t("sg.notFound.sub")}</p>
      <button className="btn-gold" onClick={() => navigate("/")}>{t("gal.goHome")}</button>
    </div></div>
  );

  const coverUrl = event.cover_path ? publicUrl(event.cover_path) : null;
  const coverPos = `${Math.round((event.cover_focus_x ?? 0.5) * 100)}% ${Math.round((event.cover_focus_y ?? 0.5) * 100)}%`;
  let dateLine = ev(event, "event_date") || "";
  try { dateLine = formatEventDate(dateLine, lang) || dateLine; } catch { /* keep raw */ }
  const sub = [ev(event, "host"), dateLine].filter(Boolean).join(" · ");

  return shell(
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}><LangToggle /></div>

      {coverUrl && (
        <div style={S.cover}>
          <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: coverPos, display: "block" }} />
          <div style={S.scrim} />
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: coverUrl ? -54 : 6, position: "relative" }}>
        <div style={{ fontSize: 11, letterSpacing: ".22em", textTransform: "uppercase", color: C.gold, fontWeight: 700 }}>{t("sg.kicker")}</div>
        <h1 className="display" style={{ fontSize: "clamp(30px, 7vw, 46px)", lineHeight: 1.02, margin: "8px 0 6px", overflowWrap: "anywhere" }}>{ev(event, "name")}</h1>
        {sub && <p style={{ color: C.second, margin: 0, fontSize: 14 }}>{sub}</p>}
        <p style={{ color: C.second, margin: "6px 0 0", fontSize: 13 }}>
          <strong style={{ color: C.text }}>{photos.length}</strong> {photos.length === 1 ? t("sg.count1") : t("sg.countN")}
        </p>

        <div style={S.actions}>
          {photos.length > 0 && (
            <button className="btn-gold" data-testid="sg-slideshow" onClick={() => navigate(`/live/${encodeURIComponent(event.code)}?from=gallery`)} style={S.btn}>
              <PlayIcon /> {t("sg.slideshow")}
            </button>
          )}
          <button className={photos.length > 0 ? "btn-soft" : "btn-gold"} onClick={onShare} style={S.btn}>
            <ShareIcon gold={photos.length > 0} /> {t("sg.share")}
          </button>
          {photos.length > 0 && (
            <button className="btn-soft" onClick={onDownload} disabled={!!zipping} style={{ ...S.btn, opacity: zipping ? 0.75 : 1 }}>
              <DownloadIcon /> {zipping ? t("sg.zipping").replace("{done}", zipping.done).replace("{total}", zipping.total) : `${t("sg.download")} (${photos.length})`}
            </button>
          )}
          <a className="btn-soft" href={`/e/${encodeURIComponent(event.code)}`} style={{ ...S.btn, textDecoration: "none", boxSizing: "border-box" }}>
            <PlusIcon /> {t("sg.addYours")}
          </a>
        </div>
        {note && <div role="status" style={S.note}>{note}</div>}
      </div>

      {photos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 10px", color: C.second }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{t("sg.empty.title")}</div>
          <p style={{ fontSize: 13.5, margin: "6px 0 0" }}>{t("sg.empty.sub")}</p>
        </div>
      ) : (
        <>
          <PhotoGrid photos={photos} dimUnkept={false} kinds={kinds} liked={liked} onLike={onLike} frame={frameFor(event)} eventCode={event.code} />
          <p style={{ textAlign: "center", fontSize: 12, color: C.second, margin: "22px auto 0", maxWidth: 420, lineHeight: 1.5 }}>{t("sg.saveNote")}</p>
        </>
      )}
    </div>
  );
}

function PlayIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>;
}
function ShareIcon({ gold = false }) {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={gold ? "var(--gold)" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v13" /><path d="M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
}
function DownloadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>;
}
function PlusIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" /></svg>;
}

const S = {
  center: { minHeight: "70vh", display: "grid", placeItems: "center", textAlign: "center", padding: "0 24px" },
  spin: { width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(var(--tint, 255,255,255),.18)", borderTopColor: "var(--gold)", display: "inline-block" },
  cover: { position: "relative", height: "clamp(170px, 34vw, 300px)", borderRadius: 20, overflow: "hidden" },
  scrim: { position: "absolute", inset: 0, background: "linear-gradient(0deg, var(--page, var(--ink, #0a0410)) 2%, color-mix(in srgb, var(--ink) 25%, transparent) 55%, transparent)" },
  actions: { display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 18 },
  btn: { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, padding: "11px 20px", borderRadius: 999, fontSize: 14.5, fontWeight: 700, maxWidth: "100%" },
  note: { display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 600, color: C.text, background: "color-mix(in srgb, var(--gold) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--gold) 45%, transparent)", borderRadius: 999, padding: "7px 14px" },
};
