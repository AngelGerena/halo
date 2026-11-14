import React, { useEffect, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";
import { sponsorsOf } from "../lib/sponsors.js";

// Live-wall sponsor display. The host picks one layout per event in
// Manage > Extras > Sponsors (events.sponsor_layout):
//   corner   presenting badge under the event name + gold logos taking turns
//   ticker   a slim strip along the bottom scrolling every logo
//   ribbon   a centered ribbon at the top: presenting + one gold at a time
//   breaks   nothing over the photos; sponsors get full-screen breaks instead
//   lower    a TV-style lower third that slides in about once a minute
//   rail     a slim rail on the right with every logo, photo shrinks to fit
//   split    the photo takes the left side, one sponsor + message on the right
//   marquee  theater marquee with blinking bulbs, one sponsor name at a time
// With no sponsors every part of this file renders nothing.

const RAIL_W = "15vw", SPLIT_W = "30vw", TICKER_H = "3.4vw";

// How much room a layout takes from the photo (right side) and from the
// bottom corners, so the slideshow can move its own pieces out of the way.
export function wallInsets(event) {
  const list = sponsorsOf(event);
  const layout = event && event.sponsor_layout;
  if (!list.length) return { right: "0px", bottom: "0px" };
  if (layout === "rail") return { right: RAIL_W, bottom: "0px" };
  if (layout === "split") return { right: SPLIT_W, bottom: "0px" };
  if (layout === "ticker") return { right: "0px", bottom: TICKER_H };
  return { right: "0px", bottom: "0px" };
}

function useTurn(n, ms) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (n < 2) { setI(0); return undefined; }
    const tmr = setInterval(() => setI((x) => (x + 1) % n), ms);
    return () => clearInterval(tmr);
  }, [n, ms]);
  return n ? i % n : 0;
}

// One sponsor mark: the logo when there is one, otherwise the name.
export function SponsorMark({ s, h = "2.2vw", name = false, color = "#fff", max = "14vw", align = "center", column = false }) {
  const [broken, setBroken] = useState(false);
  if (!s) return null;
  const showImg = s.logo && !broken;
  return (
    <span style={{ display: "inline-flex", flexDirection: column ? "column" : "row", alignItems: align, gap: column ? ".35vw" : ".6vw", minWidth: 0, maxWidth: "100%" }}>
      {showImg && <img src={s.logo} alt={s.name || ""} onError={() => setBroken(true)}
        style={{ height: h, maxWidth: max, width: "auto", objectFit: "contain", display: "block", filter: "drop-shadow(0 1px 4px rgba(0,0,0,.45))" }} />}
      {(name || !showImg) && s.name && (
        <span style={{ color, fontWeight: 700, fontSize: `calc(${h} * .5)`, lineHeight: 1.15, whiteSpace: column ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: column ? "center" : "left", overflowWrap: "anywhere" }}>{s.name}</span>
      )}
    </span>
  );
}

const glass = { background: "rgba(10,4,16,.6)", border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", borderRadius: 12 };
const eyebrow = (color) => ({ fontSize: "max(.55vw, 8px)", letterSpacing: ".18em", textTransform: "uppercase", color, fontWeight: 800 });

// The persistent part of the layout, drawn over (or beside) the photos.
// busyTop: a Shot of the night / Moment ribbon is showing at the top center.
// busyLower: a challenge caption is showing near the bottom.
export function SponsorWallLayer({ event, hidden, busyTop, busyLower }) {
  const { t } = useI18n();
  const list = sponsorsOf(event);
  const layout = (event && event.sponsor_layout) || "corner";
  const pres = list.find((s) => s.tier === "presenting") || null;
  const gold = list.filter((s) => s.tier === "gold");
  const rest = list.filter((s) => s.tier !== "presenting");
  const turnGold = useTurn(gold.length, 20000);
  const turnAll = useTurn(list.length, 20000);
  const turnFast = useTurn(rest.length || list.length, 6000);
  const [lowerOn, setLowerOn] = useState(false);
  const [lowerI, setLowerI] = useState(0);
  useEffect(() => {
    if (layout !== "lower" || !list.length) return undefined;
    let i = 0, off;
    const show = () => { setLowerI(i++); setLowerOn(true); off = setTimeout(() => setLowerOn(false), 7000); };
    const first = setTimeout(show, 8000);
    const tmr = setInterval(show, 60000);
    return () => { clearTimeout(first); clearInterval(tmr); clearTimeout(off); };
  }, [layout, list.length]);
  if (!list.length || layout === "breaks") return null;

  const fade = { opacity: hidden ? 0 : 1, transition: "opacity .6s ease", pointerEvents: "none" };
  const underBrand = { position: "absolute", left: "2.2vw", top: "calc(2.4vw + max(3.2vw, 30px) + 1.4vw)" };

  if (layout === "corner") {
    const g = gold[turnGold];
    return (
      <div data-testid="sponsor-layer" data-layout="corner" style={{ ...underBrand, display: "flex", flexDirection: "column", gap: ".7vw", alignItems: "flex-start", maxWidth: "30vw", ...fade }}>
        {pres && (
          <div style={{ ...glass, padding: ".5vw .9vw" }}>
            <div style={eyebrow(C.gold)}>{t("sponsor.presentedBy")}</div>
            <SponsorMark s={pres} h="max(2.3vw, 22px)" />
          </div>
        )}
        {g && (
          <div key={g.id} style={{ ...glass, padding: ".45vw .8vw", animation: "fadeIn .8s ease" }}>
            <div style={eyebrow("rgba(255,255,255,.75)")}>{t("spons.withThanks")}</div>
            <SponsorMark s={g} h="max(1.8vw, 18px)" />
          </div>
        )}
      </div>
    );
  }

  if (layout === "ticker") {
    const row = (k) => (
      <div key={k} style={{ display: "flex", alignItems: "center", gap: "4vw", paddingRight: "4vw", flex: "0 0 auto" }}>
        <span style={{ ...eyebrow(C.gold), fontSize: "max(.75vw, 10px)" }}>{t("spons.thanks")}</span>
        {list.map((s) => <SponsorMark key={s.id} s={s} h="max(1.9vw, 18px)" />)}
      </div>
    );
    return (
      <div data-testid="sponsor-layer" data-layout="ticker" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: TICKER_H, display: "flex", alignItems: "center", overflow: "hidden",
        background: "linear-gradient(90deg, color-mix(in srgb, var(--gold) 22%, rgba(8,4,12,.9)), rgba(8,4,12,.88) 16%, rgba(8,4,12,.88) 84%, color-mix(in srgb, var(--pink) 18%, rgba(8,4,12,.9)))",
        borderTop: "1px solid rgba(255,255,255,.12)", pointerEvents: "none", zIndex: 2 }}>
        <div className="spons-run" style={{ display: "flex", animation: `sponsRun ${Math.max(24, list.length * 7)}s linear infinite` }}>{row("a")}{row("b")}</div>
        <style>{`@keyframes sponsRun { from { transform: translateX(0) } to { transform: translateX(-50%) } } @media (prefers-reduced-motion: reduce) { .spons-run { animation: none !important } }`}</style>
      </div>
    );
  }

  if (layout === "ribbon") {
    if (busyTop) return null;
    const g = gold[turnGold];
    return (
      <div data-testid="sponsor-layer" data-layout="ribbon" style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "1.1vw", maxWidth: "60vw",
        padding: ".7vw 6vw", background: "linear-gradient(90deg, transparent, rgba(8,4,12,.86) 14%, rgba(8,4,12,.86) 86%, transparent)", ...fade }}>
        {pres && <><span style={eyebrow(C.gold)}>{t("sponsor.presentedBy")}</span><SponsorMark s={pres} h="max(1.9vw, 18px)" /></>}
        {pres && g && <span style={{ color: "rgba(255,255,255,.4)" }}>|</span>}
        {g && <span key={g.id} style={{ display: "inline-flex", alignItems: "center", gap: ".7vw", animation: "fadeIn .8s ease" }}><span style={eyebrow("rgba(255,255,255,.75)")}>{t("spons.with")}</span><SponsorMark s={g} h="max(1.7vw, 16px)" /></span>}
      </div>
    );
  }

  if (layout === "lower") {
    if (busyLower || !lowerOn) return null;
    const s = list[lowerI % list.length];
    return (
      <div data-testid="sponsor-layer" data-layout="lower" key={"lt" + lowerI} style={{ position: "absolute", left: "2.2vw", bottom: "6.4vw", display: "flex", alignItems: "stretch", borderRadius: 12, overflow: "hidden",
        boxShadow: "0 10px 30px rgba(0,0,0,.45)", animation: "sponsLt 7s ease-in-out both", pointerEvents: "none", visibility: hidden ? "hidden" : "visible" }}>
        <div style={{ width: ".45vw", background: `linear-gradient(${C.pink}, ${C.gold})` }} />
        <div style={{ background: "rgba(8,4,12,.9)", padding: ".8vw 1.3vw", display: "flex", flexDirection: "column", gap: ".35vw" }}>
          <span style={eyebrow(C.gold)}>{t("spons.broughtBy")}</span>
          <SponsorMark s={s} h="max(2.2vw, 20px)" />
        </div>
        <style>{`@keyframes sponsLt { 0% { transform: translateX(-120%); opacity: 0 } 10%, 88% { transform: none; opacity: 1 } 100% { transform: translateX(-120%); opacity: 0 } }`}</style>
      </div>
    );
  }

  if (layout === "rail") {
    const tier = (k, label, h) => {
      const items = list.filter((s) => s.tier === k);
      if (!items.length) return null;
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: ".9vw", width: "100%" }}>
          <span style={eyebrow(k === "presenting" ? C.gold : "rgba(255,255,255,.6)")}>{label}</span>
          {items.map((s) => <SponsorMark key={s.id} s={s} h={h} column max="11vw" />)}
        </div>
      );
    };
    const small = list.length > 8;
    return (
      <div data-testid="sponsor-layer" data-layout="rail" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: RAIL_W, boxSizing: "border-box", padding: "2vw 1vw", overflow: "hidden",
        background: "linear-gradient(180deg, rgba(8,4,12,.96), rgba(8,4,12,.9))", borderLeft: "1px solid rgba(255,255,255,.1)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1.6vw", pointerEvents: "none", zIndex: 2 }}>
        {tier("presenting", t("sponsor.presentedBy"), small ? "2.4vw" : "3vw")}
        {tier("gold", t("spons.tier.gold"), small ? "1.6vw" : "2.1vw")}
        {tier("community", t("spons.tier.community"), small ? "1.2vw" : "1.5vw")}
      </div>
    );
  }

  if (layout === "split") {
    const s = list[turnAll];
    return (
      <div data-testid="sponsor-layer" data-layout="split" style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: SPLIT_W, boxSizing: "border-box", padding: "3vw 2.6vw",
        background: "linear-gradient(160deg, #170c1e, #09060d)", borderLeft: "1px solid rgba(255,255,255,.1)",
        display: "flex", flexDirection: "column", justifyContent: "center", gap: "1.6vw", pointerEvents: "none", zIndex: 2 }}>
        <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: "1.4vw", animation: "fadeIn .9s ease" }}>
          <span style={eyebrow(s.tier === "presenting" ? C.gold : "#9fe9ff")}>{s.tier === "presenting" ? t("sponsor.presentedBy") : t("spons.wordFrom")}</span>
          <SponsorMark s={s} h="4vw" max="24vw" align="flex-start" column={false} />
          {s.message && <div className="serif" style={{ color: "#fff", fontSize: "1.6vw", lineHeight: 1.35, overflowWrap: "anywhere" }}>&ldquo;{s.message}&rdquo;</div>}
        </div>
        {list.length > 1 && (
          <div style={{ display: "flex", gap: ".5vw", marginTop: "1vw" }}>
            {list.map((x, i) => <i key={x.id} style={{ width: ".55vw", height: ".55vw", borderRadius: "50%", background: i === turnAll ? C.pink : "rgba(255,255,255,.25)" }} />)}
          </div>
        )}
      </div>
    );
  }

  if (layout === "marquee") {
    if (busyTop) return null;
    const s = list[turnFast % list.length] || pres;
    return (
      <div data-testid="sponsor-layer" data-layout="marquee" style={{ position: "absolute", top: "1.6vw", left: "50%", transform: "translateX(-50%)", width: "min(58vw, 900px)", height: "6.2vw", borderRadius: 12,
        background: "linear-gradient(#2a1206, #140803)", border: "2px solid #f5c96b", boxShadow: "0 0 30px rgba(245,201,107,.35)", display: "flex", alignItems: "center", justifyContent: "center", gap: "1.6vw", overflow: "hidden", ...fade }}>
        <span className="spons-bulbs" style={{ top: 5 }} /><span className="spons-bulbs" style={{ bottom: 5 }} />
        <span style={eyebrow("#f5c96b")}>{t("spons.starring")}</span>
        <span key={s.id} style={{ animation: "fadeIn .6s ease", display: "inline-flex" }}><SponsorMark s={s} h="max(2.4vw, 22px)" color="#ffe7a3" /></span>
        <style>{`.spons-bulbs { position: absolute; left: 1%; right: 1%; height: 6px; background: radial-gradient(circle, #ffe7a3 0 2px, transparent 3px) 0 0 / 14px 6px; animation: sponsBulbs 1s steps(2) infinite }
          @keyframes sponsBulbs { 50% { opacity: .35 } } @media (prefers-reduced-motion: reduce) { .spons-bulbs { animation: none } }`}</style>
      </div>
    );
  }
  return null;
}

// Full-screen sponsor moment on a timer. For the "breaks" layout it is a short
// run of screens, one per sponsor; otherwise one "Thank you to our sponsors"
// card styled to match the layout. Calls onDone when finished.
export function SponsorCard({ event, onDone }) {
  const { t } = useI18n();
  const list = sponsorsOf(event);
  const layout = (event && event.sponsor_layout) || "corner";
  const breaks = layout === "breaks";
  const run = breaks ? list.slice(0, 8) : [];
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!list.length) { onDone && onDone(); return undefined; }
    if (!breaks) { const tmr = setTimeout(() => onDone && onDone(), 10000); return () => clearTimeout(tmr); }
    if (step >= run.length) { onDone && onDone(); return undefined; }
    const tmr = setTimeout(() => setStep((x) => x + 1), run[step].tier === "presenting" ? 6000 : 5000);
    return () => clearTimeout(tmr);
  }, [step, breaks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!list.length) return null;

  const shell = (children, bg) => (
    <div data-testid="sponsor-card" data-layout={layout} style={{ position: "absolute", inset: 0, zIndex: 5, display: "grid", placeItems: "center", textAlign: "center",
      background: bg || "radial-gradient(80% 90% at 50% 0%, color-mix(in srgb, var(--pink) 20%, transparent), transparent 60%), rgba(8,4,12,.96)", animation: "fadeIn .8s ease", pointerEvents: "none" }}>
      {children}
    </div>
  );
  const pres = list.filter((s) => s.tier === "presenting");
  const gold = list.filter((s) => s.tier === "gold");
  const comm = list.filter((s) => s.tier === "community");

  if (breaks) {
    const s = run[Math.min(step, run.length - 1)];
    const label = s.tier === "presenting" ? t("spons.madePossible") : s.tier === "gold" ? t("spons.tier.gold") : t("spons.tier.community");
    return shell(
      <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2vw", maxWidth: "70vw", animation: "fadeIn .7s ease" }}>
        <div style={{ ...eyebrow(s.tier === "presenting" ? "#9fe9ff" : C.gold), fontSize: "1.1vw" }}>{label}{run.length > 1 ? ` · ${step + 1} / ${run.length}` : ""}</div>
        <SponsorMark s={s} h={s.tier === "community" ? "7vw" : "9vw"} max="50vw" column />
        {s.message && <div className="serif" style={{ color: "#fff", fontSize: "2.4vw", lineHeight: 1.3, maxWidth: "52vw", overflowWrap: "anywhere" }}>{s.message}</div>}
      </div>,
      "radial-gradient(70% 80% at 50% 30%, color-mix(in srgb, #36e3ff 16%, transparent), transparent 65%), rgba(6,3,10,.97)"
    );
  }

  const title = <div className="serif" style={{ color: "#fff", fontSize: "3.2vw", fontWeight: 700, lineHeight: 1.1 }}>{t("spons.thanks")}</div>;
  const tierLabel = (k) => <div style={{ ...eyebrow(k === "presenting" ? C.pink : k === "gold" ? C.gold : "rgba(255,255,255,.7)"), fontSize: ".9vw" }}>{k === "presenting" ? t("spons.tier.presenting") : t("spons.tier." + k)}</div>;
  const rowOf = (items, h) => <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.6vw 3.2vw" }}>{items.map((s) => <SponsorMark key={s.id} s={s} h={h} max="22vw" />)}</div>;

  if (layout === "marquee") {
    return shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6vw", width: "80vw" }}>
        <div style={{ ...eyebrow("#f5c96b"), fontSize: "1vw" }}>{t("spons.starringTonight")}</div>
        <div className="serif" style={{ color: "#ffe7a3", fontSize: "3.2vw", fontWeight: 700 }}>{t("spons.ourSponsors")}</div>
        {pres.length > 0 && rowOf(pres, "6vw")}{gold.length > 0 && rowOf(gold, "3.6vw")}{comm.length > 0 && rowOf(comm, "2.4vw")}
      </div>,
      "radial-gradient(80% 90% at 50% 0%, rgba(245,201,107,.2), transparent 60%), rgba(13,7,4,.97)"
    );
  }
  if (layout === "lower" || layout === "rail") {
    const others = [...gold, ...comm];
    return shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6vw", width: "min(80vw, 1300px)" }}>
        {title}
        {pres.map((s) => <div key={s.id} style={{ width: "100%", boxSizing: "border-box", padding: "1.6vw", borderRadius: 16, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", display: "grid", placeItems: "center" }}><SponsorMark s={s} h="5vw" max="40vw" /></div>)}
        <div style={{ width: "100%", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "1.2vw" }}>
          {others.map((s) => <div key={s.id} style={{ padding: "1.2vw", borderRadius: 14, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", display: "grid", placeItems: "center", minWidth: 0 }}><SponsorMark s={s} h={s.tier === "gold" ? "3vw" : "2.2vw"} max="20vw" /></div>)}
        </div>
      </div>
    );
  }
  if (layout === "ticker") {
    return shell(
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5vw", width: "80vw" }}>
        {title}
        {pres.length > 0 && <>{tierLabel("presenting")}{rowOf(pres, "6vw")}</>}
        {gold.length > 0 && <>{tierLabel("gold")}{rowOf(gold, "3.6vw")}</>}
        {comm.length > 0 && <>{tierLabel("community")}{rowOf(comm, "2.4vw")}</>}
      </div>
    );
  }
  // corner, ribbon, split: presenting sponsor gets its own hero side.
  return shell(
    <div style={{ display: "flex", alignItems: "center", gap: "4vw", width: "min(82vw, 1400px)", textAlign: "left" }}>
      <div style={{ flex: "0 0 38%", display: "flex", flexDirection: "column", gap: "1.6vw", alignItems: "flex-start", borderRight: "1px solid rgba(255,255,255,.14)", paddingRight: "3vw", minWidth: 0 }}>
        {pres.length > 0 ? <>{tierLabel("presenting")}{pres.map((s) => <SponsorMark key={s.id} s={s} h="6vw" max="30vw" align="flex-start" column />)}</> : null}
        {title}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.4vw", alignItems: "flex-start", minWidth: 0 }}>
        {gold.length > 0 && <>{tierLabel("gold")}<div style={{ display: "flex", flexDirection: "column", gap: "1vw" }}>{gold.map((s) => <SponsorMark key={s.id} s={s} h="3.2vw" max="26vw" align="center" />)}</div></>}
        {comm.length > 0 && <>{tierLabel("community")}<div style={{ display: "flex", flexWrap: "wrap", gap: "1vw 2.4vw" }}>{comm.map((s) => <SponsorMark key={s.id} s={s} h="2.2vw" max="18vw" />)}</div></>}
      </div>
    </div>
  );
}

// "Presented by <logo>" under a wall moment (Sponsored moments).
export function MomentBadge({ sponsor, style }) {
  const { t } = useI18n();
  if (!sponsor) return null;
  return (
    <div data-testid="moment-sponsor" style={{ display: "inline-flex", alignItems: "center", gap: ".7vw", background: "rgba(8,4,12,.78)", border: "1px solid rgba(255,255,255,.16)", borderRadius: 999,
      padding: ".4vw 1.1vw", color: "#fff", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", pointerEvents: "none", ...style }}>
      <span style={{ fontSize: "max(.8vw, 10px)", opacity: .8 }}>{t("spons.presentedByLower")}</span>
      <SponsorMark s={sponsor} h="max(1.8vw, 18px)" />
    </div>
  );
}
