import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { signPhotoUploads, putToR2 } from "../lib/r2upload.js";
import { scoreImage, C, hamming } from "../lib/score.js";
import { Footer } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { useI18n } from "../lib/i18n.jsx";
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
  const [kidsInFrame, setKidsInFrame] = useState(false); // consent: children in these photos
  const inputRef = useRef(null);
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
      }
      setLoading(false);
    })();
  }, [code]);

  // Warm the in-browser explicit-content model in the background.
  useEffect(() => { if (contributor) preloadNsfw(); }, [contributor]);

  async function loadPhotos(contributorId) {
    const { data } = await supabase
      .from("photos").select("*")
      .eq("contributor_id", contributorId)
      .order("created_at", { ascending: false });
    setPhotos((data || []).map((p) => ({ ...p, url: publicUrl(p.storage_path), edited_url: p.edited_path ? publicUrl(p.edited_path) : null })));
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

  async function addFiles(fileList) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
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
          eventId: event.id, contributorId: contributor.id, count: 1, contentType: f.type || "image/jpeg",
        });
        const path = signed.path;
        await putToR2(signed.uploadUrl, f, f.type || "image/jpeg");
        const { data: row, error } = await supabase.from("photos").insert({
          event_id: event.id,
          contributor_id: contributor.id,
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
          body: JSON.stringify({ photoId: row.id, contributorId: contributor.id }),
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
                <img src={coverUrl} alt="" style={S.coverImg} />
                <div style={S.coverScrim} />
              </div>
            ) : (
              <div style={S.coverEmpty}>
                <div style={S.coverEmptyIc} aria-hidden="true">&#43;</div>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{t("event.coverEmpty.title")}</div>
                <div style={{ fontSize: 11.5, color: C.second, marginTop: 3 }}>{t("event.coverEmpty.sub")}</div>
              </div>
            )}
            <p className="eyebrow" style={{ marginTop: 18 }}>{t("event.invited")}</p>
            <h1 className="serif" style={{ fontSize: 40, fontStyle: "italic", fontWeight: 600, margin: "6px 0 0", lineHeight: 1.02 }}>{ev(event, "name")}</h1>
            {([ev(event, "host"), ev(event, "event_date")].filter(Boolean).length > 0) && (
              <p style={{ color: C.second, margin: "8px 0 0", fontSize: 13 }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>
            )}
          </div>

          <div style={S.welcomeCard}>
            <p className="serif" style={{ fontStyle: "italic", fontSize: 16, lineHeight: 1.4, color: "#e9e3ef", textAlign: "center", margin: "0 0 18px" }}>
              {t("event.welcomeQuote")}
            </p>
            <label className="eyebrow" style={{ display: "block", marginBottom: 7 }}>{t("event.yourName")}</label>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("event.namePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && startSession()} style={{ marginBottom: 14 }} />
            <label className="eyebrow" style={{ display: "block", marginBottom: 7 }}>
              {t("event.email")} <span style={{ textTransform: "none", letterSpacing: 0, color: C.second }}>· {t("event.optional")}</span>
            </label>
            <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
              onKeyDown={(e) => e.key === "Enter" && startSession()} style={{ marginBottom: 18 }} />
            <button className="btn-gold btn-full" onClick={startSession}>{t("event.start")}</button>
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
  const galleryShown = tab === "mine" ? photos : kept;   // "Mine" = all of mine, "Gallery" = kept
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
            {coverUrl ? <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ color: C.gold, fontSize: 18 }} aria-hidden="true">&#9673;</span>}
          </a>
          <div style={{ minWidth: 0 }}>
            <div className="display" style={{ fontSize: 20, lineHeight: 1 }}>{ev(event, "name")}</div>
            <div style={{ color: C.second, fontSize: 11.5, marginTop: 3 }}>{t("up.welcome")}, {contributor.name}</div>
          </div>
        </div>

        {/* ---- ADD tab ----
            Built for a guest who has never seen HALO: lead with the one action
            (add photos), explain it in three tiny steps, speak plainly, and
            keep the kids question available but out of the way. */}
        {tab === "add" && (
          <>
            {/* 1) How it works — three glanceable steps, no jargon */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, background: "rgba(255,255,255,.03)", border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 12px", marginBottom: 14 }}>
              {[["📷", t("up.step1")], ["⬆️", t("up.step2")], ["✨", t("up.step3")]].map(([ic, label], i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span aria-hidden="true" style={{ color: C.second, fontSize: 14, flexShrink: 0 }}>&#8250;</span>}
                  <div style={{ flex: 1, textAlign: "center", minWidth: 0 }}>
                    <div style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">{ic}</div>
                    <div style={{ fontSize: 11.5, color: C.text, fontWeight: 600, marginTop: 5, lineHeight: 1.2 }}>{label}</div>
                  </div>
                </React.Fragment>
              ))}
            </div>

            {/* 2) THE action — biggest thing on the screen */}
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()} style={S.drop}>
              <div style={S.dropIc} aria-hidden="true">&#43;</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{t("up.tapToAdd")}</div>
              <div style={{ fontSize: 12.5, color: C.second, marginTop: 4 }}>{t("up.dragHere")}</div>
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
                  <div style={{ fontSize: 15, color: C.gold, fontWeight: 700 }}>
                    {photos.length === 1 ? t("up.countOne") : t("up.countMany").replace("{n}", photos.length)}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.second, marginTop: 3 }}>{t("up.hintAfter")}</div>
                </>
              )}
            </div>

            {/* 4) Kids question — still here for hosts who want it, but below the
                action and phrased as a simple question rather than a warning. */}
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

            {photos.length > 0 && (
              <p style={{ textAlign: "center", color: C.second, fontSize: 12.5, marginTop: 20 }}>
                {t("up.tapGallery")} <button onClick={() => setTab("gallery")} style={{ background: "none", color: C.gold, fontWeight: 700, padding: 0 }}>{t("up.yourGallery")} &#8594;&#xFE0E;</button>
              </p>
            )}
          </>
        )}

        {/* ---- GALLERY / MINE tabs ---- */}
        {(tab === "gallery" || tab === "mine") && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
              <h3 className="serif" style={{ fontSize: 22, margin: 0, fontStyle: "italic", fontWeight: 600 }}>
                {tab === "mine" ? t("up.allYours") : t("up.keptGallery")}
              </h3>
              <button onClick={() => { navigator.clipboard?.writeText(shareUrl); alert(t("up.linkCopied") + "\n" + shareUrl); }}
                className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12.5 }}>{t("up.copyShareLink")}</button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <StatTile label={t("up.uploaded")} value={photos.length} />
              <StatTile label={t("up.keptByHalo")} value={kept.length} gold />
            </div>
            {galleryShown.length > 0 ? (
              <PhotoGrid photos={galleryShown} />
            ) : (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.second }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{t("up.emptyTitle")}</div>
                <p style={{ fontSize: 13, margin: "6px 0 16px" }}>{t("up.emptySub")}</p>
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
  coverEmpty: { height: 150, display: "grid", placeItems: "center", textAlign: "center", border: "1.6px dashed rgba(255,255,255,.3)", borderRadius: 18, background: "rgba(255,255,255,.03)" },
  coverEmptyIc: { width: 42, height: 42, borderRadius: 12, background: "rgba(255,184,107,.14)", border: "1px solid rgba(255,184,107,.3)", display: "grid", placeItems: "center", color: C.gold, fontSize: 20, margin: "0 auto 10px" },
  welcomeCard: { background: "rgba(255,255,255,.05)", border: `1px solid ${C.line2}`, borderRadius: 20, padding: "22px 20px" },
  note: { textAlign: "center", fontSize: 11.5, color: C.second, marginTop: 16, letterSpacing: ".03em" },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: C.panel, border: `1px solid ${C.line2}`, display: "grid", placeItems: "center" },
  drop: { cursor: "pointer", border: "1.6px dashed rgba(255,255,255,.28)", background: "rgba(255,255,255,.03)", borderRadius: 18, padding: "34px 20px", textAlign: "center" },
  dropIc: { width: 46, height: 46, margin: "0 auto 10px", borderRadius: "50%", border: `3px solid ${C.gold}`, display: "grid", placeItems: "center", color: C.gold, fontSize: 22 },
  tabbar: { position: "sticky", bottom: 0, display: "flex", borderTop: `1px solid ${C.line}`, background: "#0d0716", backdropFilter: "blur(8px)" },
};
