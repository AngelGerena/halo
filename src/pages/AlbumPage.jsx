// HALO — the Album: /album/:key
//
// The simple, view-only place for the photos after the event. Co-hosts land
// here once the event is over, and anyone they send the link to sees the
// same thing. No account, no login, no host tools: tap a photo to see it big,
// play the slideshow, save, share. "Story" look: tall cover with the names on
// it, then a mix of wide and tall photos, oldest first so it reads like the night.
//
// The key is a signed token (netlify/functions/_album.js), so the link can't
// be guessed from the event code. Data comes from the album function.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { publicUrl } from "../lib/supabase.js";
import { Footer, LangToggle } from "../components/UI.jsx";
import BoomerangPlayer from "../components/BoomerangPlayer.jsx";
import AlbumViewer from "../components/album/AlbumViewer.jsx";
import AlbumSlideshow from "../components/album/AlbumSlideshow.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { frameFor } from "../lib/frames.js";
import { applyLook, clearLook } from "../lib/looks.js";
import { useSiteThemeKey } from "../lib/siteTheme.js";
import { formatEventDate } from "../lib/eventDate.js";
import { formatDate } from "../lib/retention.js";
import { shareLink } from "../lib/share.js";
import { downloadZip } from "../lib/zipDownload.js";

export default function AlbumPage() {
  const { key } = useParams();
  const { t, ev, lang } = useI18n();
  const siteLook = useSiteThemeKey();
  useEffect(() => { applyLook(siteLook); return () => clearLook(); }, [siteLook]); // eslint-disable-line react-hooks/exhaustive-deps

  const [state, setState] = useState({ status: "loading" }); // loading | ready | missing | closed | failed
  const [tryN, setTryN] = useState(0);
  const [viewing, setViewing] = useState(null);   // index into items
  const [showFrom, setShowFrom] = useState(null); // index into slides
  const [zipping, setZipping] = useState(null);
  const [note, setNote] = useState("");

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
        if (alive) setState({ status: "ready", event: j.event || {}, items, until: j.until });
      } catch {
        if (alive) setState({ status: "failed" });
      }
    })();
    return () => { alive = false; };
  }, [key, tryN]);

  const event = state.event;
  const items = state.items || [];
  const name = event ? ev(event, "name") || "" : "";
  useEffect(() => { if (name) document.title = `${name} · HALO`; }, [name]);

  const frame = useMemo(() => (event ? frameFor(event) : null), [event]);
  const slug = useMemo(() => String(event?.name || "HALO").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "HALO", [event]);
  const albumLink = typeof window !== "undefined" ? `${window.location.origin}/album/${key}` : "";
  // The slideshow plays the still photos (videos and boomerangs stay in the grid).
  const slides = useMemo(() => items.filter((p) => !p.video_url && p.kind !== "boomerang"), [items]);

  const closeViewer = useCallback(() => setViewing(null), []);
  const closeShow = useCallback(() => setShowFrom(null), []);

  function flash(m) { setNote(m); clearTimeout(window.__haloAlbT); window.__haloAlbT = setTimeout(() => setNote(""), 2600); }

  async function onShare() {
    const r = await shareLink({ url: albumLink, title: name, text: t("alb.shareText").replace("{name}", name) });
    if (r === "copied") flash(t("alb.copied"));
    else if (r === "failed") flash(t("alb.copyFailed"));
  }

  async function onSaveAll() {
    if (zipping || !items.length) return;
    setZipping({ done: 0, total: items.length });
    try {
      const files = items.map((p, i) => {
        const n = String(i + 1).padStart(3, "0");
        if (p.video_url) {
          const ext = (String(p.video_path).match(/\.([a-z0-9]+)$/i) || [, "mp4"])[1];
          return { url: p.video_url, name: `${slug}_${n}.${ext}` };
        }
        return { url: p.edited_url || p.url, name: `${slug}_${n}.jpg` };
      });
      const { missing } = await downloadZip(files, `${slug}_${files.length}-photos.zip`, (done, total) => setZipping({ done, total }));
      if (missing && missing.length) flash(t("alb.zipMissing").replace("{n}", missing.length));
    } catch { flash(t("alb.zipFailed")); }
    finally { setZipping(null); }
  }

  function startShow(fromItemIndex) {
    if (!slides.length) return;
    let s = 0;
    if (fromItemIndex != null) {
      const at = items[fromItemIndex];
      const hit = at ? slides.findIndex((p) => p.id === at.id) : -1;
      if (hit >= 0) s = hit;
      else { // a video or boomerang: start at the next still photo
        const later = slides.findIndex((p) => items.indexOf(p) > fromItemIndex);
        s = later >= 0 ? later : 0;
      }
    }
    setViewing(null);
    setShowFrom(s);
  }

  const shell = (inner) => (
    <div className="alb">
      <style>{CSS}</style>
      <main style={{ flex: 1 }}>{inner}</main>
      <Footer />
    </div>
  );
  const center = (inner) => shell(<div className="alb-center"><div>{inner}</div></div>);

  if (state.status === "loading") return center(
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--second)" }}><span className="spin alb-spin" /> {t("alb.loading")}</div>
  );
  if (state.status === "failed") return center(<>
    <p className="alb-msg">{t("alb.failed")}</p>
    <button type="button" className="btn-gold" onClick={() => setTryN((n) => n + 1)}>{t("alb.retry")}</button>
  </>);
  if (state.status === "missing" || state.status === "closed") return center(<>
    <h1 className="serif" style={{ fontSize: 30, margin: "0 0 8px" }}>{t(state.status === "missing" ? "alb.notFound.title" : "alb.closed.title")}</h1>
    <p className="alb-msg">{t(state.status === "missing" ? "alb.notFound.sub" : "alb.closed.sub")}</p>
  </>);

  const coverPath = event.cover_path;
  const coverUrl = coverPath ? publicUrl(coverPath) : (slides[0] ? slides[0].edited_url || slides[0].url : null);
  const coverPos = coverPath ? `${Math.round((event.cover_focus_x ?? 0.5) * 100)}% ${Math.round((event.cover_focus_y ?? 0.4) * 100)}%` : "center 35%";
  let dateLine = ev(event, "event_date") || "";
  try { dateLine = formatEventDate(dateLine, lang) || dateLine; } catch { /* keep raw */ }
  const sub = [ev(event, "host"), dateLine].filter(Boolean).join(" · ");
  const count = `${items.length} ${items.length === 1 ? t("alb.count1") : t("alb.countN")}`;

  return shell(
    <>
      <header className={"alb-hero" + (coverUrl ? "" : " plain")}>
        {coverUrl && <img src={coverUrl} alt="" style={{ objectPosition: coverPos }} />}
        <div className="alb-lang"><LangToggle /></div>
        <div className="alb-head">
          <div className="alb-kick">{t("alb.kicker")}</div>
          <h1 className="display alb-title">{name}</h1>
          <p className="alb-sub">{[sub, count].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <div className="alb-wrap">
        {items.length > 0 && (
          <div className="alb-actions">
            {slides.length > 0 && (
              <button type="button" className="alb-btn pri" id="alb-play" onClick={() => startShow(null)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
                {t("alb.play")}
              </button>
            )}
            <button type="button" className="alb-btn" id="alb-saveall" onClick={onSaveAll} disabled={!!zipping}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              {zipping ? t("alb.savingAll").replace("{done}", zipping.done).replace("{total}", zipping.total) : t("alb.saveAll")}
            </button>
            <button type="button" className="alb-btn" id="alb-share" onClick={onShare}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v13M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
              {t("alb.share")}
            </button>
          </div>
        )}
        {note && <div role="status" className="alb-note">{note}</div>}
        {items.length > 0 && <p className="alb-hint">{t("alb.tap")}{state.until ? ` · ${t("alb.until").replace("{date}", formatDate(state.until, lang))}` : ""}</p>}

        {items.length === 0 ? (
          <div className="alb-empty">
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{t("alb.empty.title")}</div>
            <p style={{ margin: "6px 0 0" }}>{t("alb.empty.sub")}</p>
          </div>
        ) : (
          <div className="alb-grid">
            {items.map((p, i) => (
              <button type="button" key={p.id} className={"alb-tile" + (i % 5 === 0 ? " wide" : "")} onClick={() => setViewing(i)}
                aria-label={t("alb.of").replace("{n}", i + 1).replace("{total}", items.length)}>
                {p.kind === "boomerang"
                  ? <BoomerangPlayer src={p.url} frames={p.loop_frames} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                  : <img src={p.edited_url || p.url} alt="" loading={i < 6 ? "eager" : "lazy"} decoding="async" />}
                {p.video_url && (
                  <span className="alb-play" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {items.length > 0 && <p className="alb-fine">{t("alb.saveAllNote")}</p>}
      </div>

      {viewing != null && (
        <AlbumViewer items={items} index={viewing} onIndex={setViewing} onClose={closeViewer} frame={frame} slug={slug}
          albumLink={albumLink} albumTitle={name} onSlideshow={startShow} />
      )}
      {showFrom != null && <AlbumSlideshow photos={slides} start={showFrom} title={name} onClose={closeShow} />}
    </>
  );
}

const CSS = `
.alb{min-height:100vh;display:flex;flex-direction:column;color:var(--text);background:var(--page, var(--ink, #0a0410));font-variant-emoji:text}
.alb-center{min-height:70vh;display:grid;place-items:center;text-align:center;padding:0 24px}
.alb-msg{color:var(--second);max-width:340px;margin:0 auto 18px;line-height:1.5}
.alb-spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(var(--tint, 255,255,255),.18);border-top-color:var(--gold);display:inline-block}

.alb-hero{position:relative;height:clamp(320px,64vh,540px);overflow:hidden;background:var(--panel, #151019)}
.alb-hero.plain{height:auto;padding-top:56px}
.alb-hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.alb-hero:not(.plain)::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--page, var(--ink, #0a0410)) 0%,rgba(0,0,0,.35) 42%,rgba(0,0,0,0) 70%),linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,0) 22%)}
.alb-lang{position:absolute;z-index:2;top:calc(12px + env(safe-area-inset-top, 0px));right:max(14px, env(safe-area-inset-right, 0px))}
.alb-head{position:relative;z-index:1;max-width:960px;margin:0 auto;padding:0 max(20px, env(safe-area-inset-right, 0px)) 18px max(20px, env(safe-area-inset-left, 0px));display:flex;flex-direction:column;justify-content:flex-end;height:100%;box-sizing:border-box}
.alb-hero.plain .alb-head{height:auto}
.alb-kick{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:800}
.alb-title{font-size:clamp(34px,9vw,60px);line-height:1;margin:8px 0 8px;overflow-wrap:anywhere;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.45);text-wrap:balance}
.alb-hero.plain .alb-title{color:var(--text);text-shadow:none}
.alb-sub{margin:0;font-size:14px;color:rgba(255,255,255,.86);text-shadow:0 1px 8px rgba(0,0,0,.5)}
.alb-hero.plain .alb-sub{color:var(--second);text-shadow:none}

.alb-wrap{max-width:960px;width:100%;margin:0 auto;box-sizing:border-box;padding:14px max(12px, env(safe-area-inset-right, 0px)) 48px max(12px, env(safe-area-inset-left, 0px))}
.alb-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 8px}
.alb-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:10px 16px;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;border:1px solid var(--line2, rgba(255,255,255,.18));background:rgba(var(--tint, 255,255,255),.06);color:var(--text);min-width:0}
.alb-btn svg{width:18px;height:18px;flex:none}
.alb-btn.pri{grid-column:1/-1;background:var(--gold);border-color:var(--gold);color:var(--ink, #0a0410);font-size:16px;min-height:52px}
.alb-btn:disabled{opacity:.75;cursor:default}
.alb-btn:focus-visible,.alb-tile:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
@media (min-width:640px){.alb-actions{grid-template-columns:auto auto auto;justify-content:start}.alb-btn.pri{grid-column:auto}}
.alb-note{display:block;width:max-content;max-width:calc(100% - 16px);margin:12px 8px 0;font-size:13px;font-weight:600;background:color-mix(in srgb, var(--gold) 14%, transparent);border:1px solid color-mix(in srgb, var(--gold) 45%, transparent);border-radius:999px;padding:7px 14px}
.alb-hint{font-size:12.5px;color:var(--second);margin:12px 8px 10px}
.alb-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;grid-auto-flow:dense}
.alb-tile{position:relative;display:block;padding:0;border:0;background:rgba(var(--tint, 255,255,255),.06);aspect-ratio:3/4;overflow:hidden;cursor:zoom-in;border-radius:4px}
.alb-tile.wide{grid-column:1/-1;aspect-ratio:16/10}
.alb-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
@media (hover:hover){.alb-tile:hover img{transform:scale(1.03)}}
@media (min-width:760px){.alb-grid{grid-template-columns:repeat(3,1fr);gap:6px}.alb-tile.wide{grid-column:span 2;aspect-ratio:auto}}
.alb-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.55);color:#fff;border:1px solid rgba(255,255,255,.4)}
.alb-empty{text-align:center;padding:48px 12px;color:var(--second)}
.alb-fine{text-align:center;font-size:12px;color:var(--second);margin:22px auto 0;max-width:440px;line-height:1.5}

.albv{position:fixed;inset:0;z-index:80;background:#050307;color:#fff;display:flex;flex-direction:column;
  padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)}
.albv-top{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px}
.albv-round{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.3);cursor:pointer}
.albv-count{font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.albv-stage{position:relative;flex:1;min-height:0;overflow:hidden;touch-action:pan-y pinch-zoom}
.albv-media{position:absolute;inset:0;margin:auto;max-width:calc(100% - 16px);max-height:100%;width:auto;height:auto;object-fit:contain;display:block;user-select:none;-webkit-user-select:none}
video.albv-media{width:calc(100% - 16px);height:100%;background:#000}
.albv-boom{position:absolute;inset:0 8px}
.albv-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.45);color:#fff;border:1px solid rgba(255,255,255,.25);cursor:pointer}
.albv-nav.l{left:10px}.albv-nav.r{right:10px}
.albv-note{min-height:20px;text-align:center;font-size:12.5px;color:rgba(255,255,255,.72);padding:6px 16px 0}
.albv-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 12px 14px;max-width:460px;width:100%;margin:0 auto;box-sizing:border-box}
.albv-act{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:0;color:#fff;font-size:13px;font-weight:700;cursor:pointer;padding:4px 0;min-height:44px}
.albv-act .i{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.24)}
.albv-act.hot .i{background:var(--gold);border-color:var(--gold);color:var(--ink, #0a0410)}
.albv-act svg{width:22px;height:22px}
.albv-act:focus-visible .i,.albv-round:focus-visible,.albv-nav:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.albv-spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;display:inline-block}

.albs{position:fixed;inset:0;z-index:90;background:#000;overflow:hidden;cursor:pointer}
.albs-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
.albs-img.on{animation:albsIn 1.2s ease both}
@keyframes albsIn{from{opacity:0}to{opacity:1}}
.albs-title{position:absolute;top:calc(18px + env(safe-area-inset-top, 0px));left:70px;right:70px;text-align:center;color:#fff;font-weight:700;font-size:15px;text-shadow:0 2px 10px rgba(0,0,0,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.albs-x{position:absolute;top:calc(10px + env(safe-area-inset-top, 0px));right:max(12px, env(safe-area-inset-right, 0px))}
.albs-bar{position:absolute;left:max(14px, env(safe-area-inset-left, 0px));right:max(14px, env(safe-area-inset-right, 0px));bottom:calc(16px + env(safe-area-inset-bottom, 0px));display:flex;justify-content:space-between;gap:10px;color:#fff;font-size:12.5px;font-weight:700}
.albs-bar span{background:rgba(0,0,0,.55);padding:7px 12px;border-radius:999px;font-variant-numeric:tabular-nums}
@media (prefers-reduced-motion:reduce){.albs-img.on{animation:none}.alb-tile img{transition:none}}
`;
