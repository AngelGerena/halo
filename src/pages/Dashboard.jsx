// HALO — client dashboard (/dashboard).
//
// A signed-in client's own space: create events, see their QR/guest links, and
// manage each one (review photos, launch the slideshow, view the gallery,
// download) using the SAME event-management UI as the super-admin — scoped to
// just this client.
//
// How the scoping works: events are read through the anon Supabase client
// (src/lib/supabase.js). With a user signed in, RLS makes that query return
// ONLY the client's own events (plus active ones), so we do NOT filter by
// owner_id here — the policy does it. Mutations go through Netlify functions
// authorized by the client's JWT (see src/lib/authedFetch.js).
//
// This is NOT the super-admin page: there is no "super admin" label, no
// all-clients view, and no global hero/music-library managers.
import React, { useEffect, useMemo, useState } from "react";
import { supabase, publicUrl } from "../lib/supabase.js";
import { Footer, Spinner, Empty, LangToggle } from "../components/UI.jsx";
import { CreateEvent, EventDetail } from "../components/EventManager.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { useAuth, RequireAuth } from "../lib/auth.jsx";
import { makeApi } from "../lib/authedFetch.js";
import { useSiteTheme } from "../lib/siteTheme.js";

// "Poster Stack" look: every event is a full-bleed poster built from its
// cover (or its best-rated photo), with a date tile, the name in Anton and
// three equal actions in the thumb zone. Colours follow the site theme.

const FALLBACK = {
  wedding: "/landing/images/wedding.webp",
  quinceanera: "/landing/images/quinceanera.webp",
  church: "/landing/images/moments/church-doors.webp",
};
const fallbackCover = (cat) => FALLBACK[cat] || "/landing/images/friends.webp";

const I = {
  plus: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  play: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>,
  link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>,
};

const PS_CSS = `
.ps{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;background:#000;color:#fff}
.ps-top{display:flex;justify-content:space-between;align-items:center;gap:12px;max-width:1100px;width:100%;margin:0 auto;
  padding:calc(12px + env(safe-area-inset-top,0px)) max(18px,env(safe-area-inset-right,0px)) 0 max(18px,env(safe-area-inset-left,0px))}
.ps-wm{font-family:var(--display);font-size:28px;letter-spacing:.06em;line-height:1;color:#fff;text-decoration:none}
.ps-right{display:flex;align-items:center;gap:8px}
.ps-av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:#fff}
.ps-main{flex:1;width:100%;max-width:1100px;margin:0 auto;padding:0 max(18px,env(safe-area-inset-right,0px)) 10px max(18px,env(safe-area-inset-left,0px))}
.ps-hello{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;padding:20px 0 4px}
.ps-hello>div{min-width:0}
.ps-eyebrow{font-size:11px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--gold-light)}
.ps-title{font-family:var(--display);font-weight:400;font-size:clamp(50px,13vw,72px);line-height:.9;letter-spacing:.02em;margin:8px 0 0}
.ps-who{margin:8px 0 0;color:#c6cad8;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-who b{color:#fff;font-weight:600}
.ps-out{appearance:none;background:transparent;color:#c6cad8;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer}
.ps-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;margin-top:18px}
@media(min-width:760px){.ps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:1060px){.ps-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.ps-new{appearance:none;width:100%;text-align:left;cursor:pointer;color:#fff;border:1.5px dashed color-mix(in srgb,var(--gold) 60%,transparent);border-radius:26px;padding:20px 18px;display:flex;align-items:center;gap:14px;background:color-mix(in srgb,var(--gold) 7%,transparent);transition:background .2s}
.ps-new:hover{background:color-mix(in srgb,var(--gold) 13%,transparent)}
.ps-new .plus{width:48px;height:48px;border-radius:50%;flex:none;display:grid;place-items:center;background:var(--gold);color:var(--ps-on)}
.ps-new .plus svg{width:22px;height:22px}
.ps-new b{display:block;font-size:16px}
.ps-new span{font-size:13px;color:#c6cad8}
.ps-form{margin-top:4px}
.poster{position:relative;border-radius:26px;overflow:hidden;min-height:340px;padding-top:68px;display:flex;flex-direction:column;justify-content:flex-end;background:#111;box-shadow:0 24px 50px rgba(0,0,0,.5);isolation:isolate}
.poster .bg{position:absolute;inset:0;z-index:-2;background:#111 center/cover no-repeat;transition:transform .6s ease,opacity .35s ease}
.poster:hover .bg{transform:scale(1.03)}
.poster::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.4) 0%,transparent 28%,rgba(0,0,0,.5) 56%,rgba(0,0,0,.94) 100%)}
.poster .open{position:absolute;inset:0;z-index:0;border:0;background:transparent;cursor:pointer;border-radius:26px}
.poster .tagrow{position:absolute;top:14px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none;z-index:1}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;border-radius:999px;padding:6px 11px;white-space:nowrap;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.pill.live{color:#fff;border:1px solid color-mix(in srgb,var(--gold) 60%,transparent)}
.pill.live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold);animation:psPing 1.6s ease-out infinite}
.pill.done{color:#3ee08f;border:1px solid rgba(62,224,143,.45)}
.datebox{background:rgba(0,0,0,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:7px 11px;text-align:center;line-height:1}
.datebox small{display:block;font-size:10px;font-weight:700;letter-spacing:.16em;color:var(--gold-light)}
.datebox b{font-family:var(--display);font-weight:400;font-size:28px}
.poster .inner{position:relative;z-index:1;padding:18px 16px 16px;display:flex;flex-direction:column;gap:12px;pointer-events:none}
.poster .inner>*{pointer-events:auto}
.poster .code{font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.7)}
.poster h3{font-family:var(--display);font-weight:400;font-size:clamp(34px,9.5vw,42px);line-height:.94;letter-spacing:.02em;margin:0;text-wrap:balance;color:#fff;overflow-wrap:anywhere}
.poster .meta{margin:-4px 0 0;font-size:13.5px;color:#e7e3ee}
.poster .wait{margin:0;font-size:13px;color:#e7e3ee;max-width:34ch}
.ps-stats{display:flex;gap:18px}
.ps-stats div{display:flex;flex-direction:column;gap:1px}
.ps-stats b{font-family:var(--display);font-weight:400;font-size:24px;line-height:1}
.ps-stats small{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#b9b2c4}
.ps-acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ps-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:999px;padding:0 8px;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap;text-decoration:none;border:0}
.ps-btn svg{width:16px;height:16px;flex:none}
.ps-btn.a{background:var(--gold);color:var(--ps-on);box-shadow:0 10px 24px color-mix(in srgb,var(--gold) 30%,transparent)}
.ps-btn.g{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.2);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.ps-btn:focus-visible,.poster .open:focus-visible,.ps-new:focus-visible{outline:2px solid var(--gold-light);outline-offset:2px}
@keyframes psPing{0%{box-shadow:0 0 0 0 var(--gold)}70%,100%{box-shadow:0 0 0 7px transparent}}
@media(prefers-reduced-motion:reduce){.pill.live::before{animation:none}.poster .bg{transition:none}}
`;

export default function Dashboard() {
  const { t } = useI18n();
  return (
    <Shell>
      <RequireAuth fallback={<Spinner label={t("dash.loading")} />}>
        <DashboardInner />
      </RequireAuth>
    </Shell>
  );
}

// Month + day for the date tile, when the free-text date can be read.
function dateTile(e, lang) {
  const raw = e.event_date || "";
  const d = new Date(raw);
  if (!raw || isNaN(d)) return null;
  const mon = d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", { month: "short" }).replace(".", "").toUpperCase();
  return { mon, day: d.getDate() };
}

// Per-event poster data: cover (set cover, else best-rated photo) and counts.
function useEventInfo(events) {
  const [info, setInfo] = useState({});
  useEffect(() => {
    let alive = true;
    events.forEach(async (e) => {
      try {
        const [best, photos, guests, clips] = await Promise.all([
          e.cover_path ? Promise.resolve({ data: [] })
            : supabase.from("photos").select("storage_path").eq("event_id", e.id).eq("kept", true).is("video_path", null)
                .order("quality", { ascending: false, nullsFirst: false }).limit(1),
          supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", e.id),
          supabase.from("contributors").select("id", { count: "exact", head: true }).eq("event_id", e.id),
          supabase.from("photos").select("id", { count: "exact", head: true }).eq("event_id", e.id).not("video_path", "is", null),
        ]);
        const path = e.cover_path || best.data?.[0]?.storage_path || null;
        if (!alive) return;
        setInfo((m) => ({ ...m, [e.id]: {
          cover: path ? publicUrl(path) : null,
          photos: photos.count || 0, guests: guests.count || 0, clips: clips.count || 0,
        } }));
      } catch {}
    });
    return () => { alive = false; };
  }, [events]);
  return info;
}

function Poster({ e, info, onOpen }) {
  const { t, ev, lang } = useI18n();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/e/${e.code}`;
  const tile = dateTile(e, lang);
  // Use the event's own cover right away. Only when there is no cover do we
  // wait for the best-photo lookup, and only then fall back to a stock image,
  // so the poster never flashes a different photo first.
  const cover = e.cover_path ? publicUrl(e.cover_path) : info ? (info.cover || fallbackCover(e.category)) : null;
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (!cover) return;
    let alive = true;
    const img = new Image();
    img.onload = img.onerror = () => { if (alive) setShown(cover); };
    img.src = cover;
    return () => { alive = false; };
  }, [cover]);
  const pos = e.cover_path && e.cover_focus_x != null ? `${Math.round(e.cover_focus_x * 100)}% ${Math.round((e.cover_focus_y ?? 0.4) * 100)}%` : "center 35%";
  const live = !e.published_at;
  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch {
      const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {} ta.remove();
    }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }
  return (
    <article className="poster">
      <div className="bg" style={{ backgroundImage: shown ? `url(${shown})` : "none", backgroundPosition: pos, opacity: shown ? 1 : 0 }} aria-hidden="true" />
      <button className="open" onClick={onOpen} aria-label={`${t("dash.manage")}: ${ev(e, "name")}`} />
      <div className="tagrow">
        <span className={"pill " + (live ? "live" : "done")}>{live ? t("dash.status.live") : t("dash.status.published")}</span>
        {tile && <div className="datebox"><small>{tile.mon}</small><b>{tile.day}</b></div>}
      </div>
      <div className="inner">
        <span className="code">{e.code}{e.is_recurring ? " · ↻︎" : ""}</span>
        <h3>{ev(e, "name")}</h3>
        {(ev(e, "host") || ev(e, "event_date")) && <p className="meta">{[ev(e, "host"), ev(e, "event_date")].filter(Boolean).join(" · ")}</p>}
        {info && info.photos > 0 ? (
          <div className="ps-stats">
            <div><b>{info.photos}</b><small>{t("dash.photos")}</small></div>
            <div><b>{info.guests}</b><small>{t("dash.guests")}</small></div>
            {info.clips > 0 && <div><b>{info.clips}</b><small>{t("dash.clips")}</small></div>}
          </div>
        ) : info ? <p className="wait">{t("dash.waiting")}</p> : null}
        <div className="ps-acts">
          <button className="ps-btn a" onClick={onOpen}>{t("dash.manage")}</button>
          <a className="ps-btn g" href={`/live/${e.code}`} target="_blank" rel="noreferrer">{I.play}{t("dash.wall")}</a>
          <button className="ps-btn g" onClick={copy} aria-live="polite">{copied ? I.check : I.link}{copied ? t("dash.copied") : t("dash.copy")}</button>
        </div>
      </div>
    </article>
  );
}

function DashboardInner() {
  const { t } = useI18n();
  const { user, session, signOut } = useAuth();
  const api = useMemo(() => makeApi(session), [session]);

  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const info = useEventInfo(events);

  async function loadEvents() {
    // RLS scopes this to the signed-in client's own events.
    const { data: own } = await supabase.from("events").select("*").order("created_at", { ascending: false });
    // Plus events this person co-hosts (invited by email by the owner).
    let co = [];
    try { co = (await api.fn("cohost-events", {})).events || []; } catch {}
    const seen = new Set((own || []).map((e) => e.id));
    const data = [...(own || []), ...co.filter((e) => !seen.has(e.id))];
    setEvents(data);
    setLoading(false);
    // Deep link from the morning-after email: /dashboard?event=CODE opens
    // that event directly (once), then cleans the URL.
    try {
      const code = new URLSearchParams(window.location.search).get("event");
      if (code) {
        const hit = (data || []).find((e) => e.code === code);
        if (hit) setSelected(hit);
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {}
  }
  useEffect(() => { loadEvents(); }, []);

  if (selected) {
    return (
      <div className="wrap" style={{ paddingTop: 8 }}>
        <EventDetail event={selected} api={api} back={() => { setSelected(null); loadEvents(); }} />
      </div>
    );
  }

  const who = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "";

  return (
    <div>
      <div className="ps-hello">
        <div>
          <div className="ps-eyebrow">{t("dash.space")}</div>
          <h1 className="ps-title">{t("dash.title")}</h1>
          {who && <p className="ps-who">{t("dash.signedInAs")} <b>{who}</b></p>}
        </div>
        <button className="ps-out" onClick={signOut}>{t("dash.signOut")}</button>
      </div>

      <div className="ps-grid">
        <div className="ps-form" style={{ gridColumn: "1 / -1" }}>
          <CreateEvent
            api={api}
            onCreated={(newEvent) => { loadEvents(); if (newEvent) setSelected(newEvent); }}
            renderTrigger={(open) => (
              <button className="ps-new" onClick={open}>
                <span className="plus">{I.plus}</span>
                <span><b>{t("admin.createEvent").replace(/^\+\s*/, "")}</b><span>{t("dash.createSub")}</span></span>
              </button>
            )}
          />
        </div>
        {loading ? (
          <div style={{ gridColumn: "1 / -1" }}><Spinner label={t("dash.loading")} /></div>
        ) : events.length === 0 ? (
          <div style={{ gridColumn: "1 / -1" }}><Empty title={t("dash.noEvents.title")} sub={t("dash.noEvents.sub")} /></div>
        ) : (
          events.map((e) => <Poster key={e.id} e={e} info={info[e.id]} onOpen={() => setSelected(e)} />)
        )}
      </div>
    </div>
  );
}

function Shell({ children }) {
  const th = useSiteTheme();
  const { user } = useAuth();
  const name = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "";
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  return (
    <div className="ps" style={{ "--gold": th.a, "--gold-light": th.a2, "--ps-on": th.on }}>
      <style>{PS_CSS}</style>
      <header className="ps-top">
        <a href="/" className="ps-wm" aria-label="HALO home">HALO</a>
        <div className="ps-right">
          <LangToggle />
          {initials && <span className="ps-av" aria-hidden="true">{initials}</span>}
        </div>
      </header>
      <main className="ps-main">{children}</main>
      <Footer />
    </div>
  );
}
