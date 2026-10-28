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
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { Header, Footer, Spinner, Empty } from "../components/UI.jsx";
import { CreateEvent, EventDetail } from "../components/EventManager.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { useAuth, RequireAuth } from "../lib/auth.jsx";
import { makeApi } from "../lib/authedFetch.js";

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

function DashboardInner() {
  const { t, ev } = useI18n();
  const { user, session, signOut } = useAuth();
  const api = useMemo(() => makeApi(session), [session]);

  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

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
    return <EventDetail event={selected} api={api} back={() => { setSelected(null); loadEvents(); }} />;
  }

  const who = user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "inline-flex", padding: "5px 12px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{t("dash.space")}</div>
          <h2 className="serif" style={{ fontSize: 32, color: C.text, margin: "8px 0 2px" }}>{t("dash.myEvents")}</h2>
          {who && (
            <div style={{ fontSize: 12, color: C.second, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
              {t("dash.signedInAs")} <strong style={{ color: C.text }}>{who}</strong>
            </div>
          )}
        </div>
        <button onClick={signOut} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "8px 14px", borderRadius: 999, fontSize: 13 }}>{t("dash.signOut")}</button>
      </div>

      <CreateEvent api={api} onCreated={(newEvent) => { loadEvents(); if (newEvent) setSelected(newEvent); }} />

      {loading ? (
        <Spinner label={t("dash.loading")} />
      ) : events.length === 0 ? (
        <Empty title={t("dash.noEvents.title")} sub={t("dash.noEvents.sub")} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14, marginTop: 22 }}>
          {events.map((e) => {
            const eventUrl = `${window.location.origin}/e/${e.code}`;
            return (
              <div key={e.id} className="card"
                style={{ display: "flex", flexDirection: "column", background: C.card, border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18 }}>
                <button onClick={() => setSelected(e)}
                  style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: C.gold, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase" }}>{e.code}{e.is_recurring ? " · ↻" : ""}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: e.published_at ? C.gold : "rgba(255,255,255,.08)", color: e.published_at ? C.ink : C.second, border: e.published_at ? "none" : `1px solid ${C.line2}` }}>
                      {e.published_at ? t("dash.status.published") : t("dash.status.live")}
                    </span>
                  </div>
                  <div className="serif" style={{ fontSize: 22, color: C.text, margin: "6px 0 2px", lineHeight: 1.1 }}>{ev(e, "name")}</div>
                  <div style={{ fontSize: 12, color: C.second }}>{[ev(e, "host"), ev(e, "event_date")].filter(Boolean).join(" · ")}</div>
                </button>

                <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                  <button onClick={() => setSelected(e)}
                    style={{ background: C.gold, color: C.ink, padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 700 }}>{t("dash.manage")}</button>
                  <a href={`${window.location.origin}/live/${e.code}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                    <button style={{ background: "rgba(255,255,255,.08)", color: C.onInk, border: `1px solid ${C.line2}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>▶</button>
                  </a>
                  <button onClick={() => { navigator.clipboard?.writeText(eventUrl); alert(t("admin.linkCopied") + "\n" + eventUrl); }}
                    style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("admin.copyLink")}</button>
                </div>
              </div>
            );
          })}
        </div>
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
