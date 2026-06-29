import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase, publicUrl } from "../lib/supabase.js";
import { scoreImage, C } from "../lib/score.js";
import { Header, Footer, Stat, Spinner, Empty } from "../components/UI.jsx";
import { PhotoGrid } from "../components/PhotoGrid.jsx";
import { useI18n } from "../lib/i18n.jsx";

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
  const [showAll, setShowAll] = useState(false);
  const [kidsInFrame, setKidsInFrame] = useState(false); // V2 consent: children in these photos
  const inputRef = useRef(null);

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

    // V2 moderation gate: public immediately, or held for the super-admin to review first.
    const needsReview = event.moderation_mode === "review" || (event.protect_minors && kidsInFrame);
    const initialStatus = needsReview ? "pending" : "approved";
    const sessionLabel = event.current_session || null; // V2 recurring-service session tag

    for (const f of files) {
      try {
        const s = await scoreImage(f);
        const kept = s.quality >= (event.keep_threshold ?? 45);
        const path = `${event.id}/${contributor.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        const up = await supabase.storage.from("halo").upload(path, f, { contentType: f.type, upsert: false });
        if (up.error) throw up.error;
        const { data: row, error } = await supabase.from("photos").insert({
          event_id: event.id,
          contributor_id: contributor.id,
          storage_path: path,
          quality: s.quality, focus: s.focus, exposure: s.exposure,
          kept, width: s.width, height: s.height,
          has_minors: kidsInFrame,
          status: initialStatus,
          session_label: sessionLabel,
        }).select().single();
        if (error) throw error;
        setPhotos((prev) => [{ ...row, url: publicUrl(path) }, ...prev]);

        // Phase 3: fire auto-edit in the background; patch the row when ready.
        fetch("/.netlify/functions/edit-photo", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId: row.id }),
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
  }

  if (loading) return <Shell><Spinner label={t("event.opening")} /></Shell>;
  if (event === false) return (
    <Shell><Empty title={t("event.notFound.title")} sub={t("event.notFound.sub")} action={t("gal.goHome")} onAction={() => navigate("/")} /></Shell>
  );

  // sign-in screen
  if (!contributor) {
    return (
      <Shell code={event.code}>
        <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: "6px 14px", borderRadius: 999, background: C.ink, color: C.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", marginTop: 14 }}>{t("event.invited")}</div>
          <h1 className="serif" style={{ fontSize: 44, color: C.ink, margin: "14px 0 6px", lineHeight: 1.06 }}>{ev(event, "name")}</h1>
          <p style={{ color: C.second, margin: 0 }}>{[ev(event, "host"), ev(event, "event_date")].filter(Boolean).join(" · ")}</p>

          <div style={{ background: C.white, border: "1px solid rgba(28,38,64,.1)", borderRadius: 16, padding: 24, textAlign: "left", marginTop: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("event.yourName")}</label>
            <p style={{ fontSize: 12, color: C.second, margin: "4px 0 10px" }}>{t("event.yourName.help")}</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("event.namePlaceholder")}
              onKeyDown={(e) => e.key === "Enter" && startSession()}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(28,38,64,.2)", marginBottom: 14 }} />
            <label style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("event.email")} <span style={{ color: C.second, fontWeight: 400 }}>{t("event.optional")}</span></label>
            <p style={{ fontSize: 12, color: C.second, margin: "4px 0 10px" }}>{t("event.email.help")}</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
              onKeyDown={(e) => e.key === "Enter" && startSession()}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(28,38,64,.2)", marginBottom: 14 }} />
            <button onClick={startSession} style={{ width: "100%", background: C.gold, color: C.ink, padding: "13px", borderRadius: 10, fontSize: 15 }}>{t("event.start")}</button>
          </div>
        </div>
      </Shell>
    );
  }

  // uploader + gallery
  const kept = photos.filter((p) => p.kept);
  const shown = showAll ? photos : kept;
  const shareUrl = `${window.location.origin}/g/${contributor.id}`;
  const connectLabel = (lang === "es" && event.connect_label_es) ? event.connect_label_es : (event.connect_label || t("connect.cta"));

  return (
    <Shell code={event.code}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h2 className="serif" style={{ fontSize: 30, color: C.ink, marginBottom: 2 }}>{t("up.welcome")}, {contributor.name}</h2>
        <p style={{ color: C.second, marginTop: 0 }}>{ev(event, "name")} — {t("up.uploadEverything")}</p>

        {/* V2 consent-first child safety toggle */}
        <button
          type="button"
          onClick={() => setKidsInFrame((v) => !v)}
          aria-pressed={kidsInFrame}
          style={{ width: "100%", textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start", background: kidsInFrame ? "rgba(197,164,75,.12)" : C.white, border: `1px solid ${kidsInFrame ? C.gold : "rgba(28,38,64,.15)"}`, borderRadius: 12, padding: "12px 14px", margin: "4px 0 14px" }}>
          <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, marginTop: 1, background: kidsInFrame ? C.gold : "transparent", border: `2px solid ${kidsInFrame ? C.gold : C.second}`, display: "grid", placeItems: "center", color: C.ink, fontSize: 14, fontWeight: 700 }}>{kidsInFrame ? "✓" : ""}</span>
          <span>
            <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: C.ink }}>{t("up.kidsToggle")}</span>
            <span style={{ display: "block", fontSize: 12, color: C.second, marginTop: 2 }}>{t("up.kidsHelp")}</span>
          </span>
        </button>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          style={{ cursor: "pointer", border: `2px dashed ${C.second}`, background: C.white, borderRadius: 18, padding: "40px 20px", textAlign: "center" }}>
          <div style={{ width: 46, height: 46, margin: "0 auto 8px", borderRadius: "50%", border: `3px solid ${C.gold}` }} />
          <div style={{ fontWeight: 700, color: C.ink, fontSize: 17 }}>{t("up.tapToAdd")}</div>
          <div style={{ fontSize: 13, color: C.second, marginTop: 4 }}>{t("up.dragHere")}</div>
          <input ref={inputRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {uploading > 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: C.second, display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spin" style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid rgba(107,140,174,.3)`, borderTopColor: C.gold, display: "inline-block" }} />
            {t("up.uploading")} {uploading}…
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Stat label={t("up.uploaded")} value={photos.length} />
          <Stat label={t("up.keptByHalo")} value={kept.length} gold />
        </div>

        {/* V2 "Connect" call-to-action — turns a photo moment into a next step */}
        {event.connect_url && (
          <a href={event.connect_url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "block", marginTop: 16 }}>
            <div style={{ background: C.ink, borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ color: C.bg, fontWeight: 700, fontSize: 15 }}>{connectLabel}</div>
                <div style={{ color: C.gold, fontSize: 12, marginTop: 2 }}>{t("connect.sub")}</div>
              </div>
              <span style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `2px solid ${C.gold}`, color: C.gold, display: "grid", placeItems: "center", fontSize: 18 }}>→</span>
            </div>
          </a>
        )}

        {photos.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 26, flexWrap: "wrap", gap: 10 }}>
              <h3 className="serif" style={{ fontSize: 24, color: C.ink, margin: 0 }}>{t("up.yourGallery")}</h3>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setShowAll((s) => !s)} style={{ background: "transparent", color: C.second, border: `1px solid ${C.second}`, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{showAll ? t("up.keptOnly") : `${t("up.all")} (${photos.length})`}</button>
                <button onClick={() => { navigator.clipboard?.writeText(shareUrl); alert(t("up.linkCopied") + "\n" + shareUrl); }} style={{ background: C.ink, color: C.bg, padding: "7px 12px", borderRadius: 999, fontSize: 12 }}>{t("up.copyShareLink")}</button>
              </div>
            </div>
            <PhotoGrid photos={shown} />
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, code }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main className="wrap" style={{ flex: 1 }}>{children}</main>
      <Footer code={code} />
    </div>
  );
}
