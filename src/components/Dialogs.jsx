// HALO — in-app dialogs and toasts.
//
// Replaces the browser's native confirm/alert/prompt boxes (which look like a
// system error on iPhone and can't be translated or styled) with a dark card
// that matches the app.
//
//   const { confirm, prompt, alert, toast } = useDialogs();
//   if (!(await confirm({ title, message, confirmLabel, danger: true }))) return;
//   const typed = await prompt({ title, message, placeholder });   // string | null
//   await alert({ title, message });
//   toast(t("admin.saved"), "success");                            // "success" | "error" | "info"
//
// One dialog shows at a time (extra calls wait in a queue). Esc or tapping the
// dim background cancels. Focus moves into the dialog, Tab stays inside it, and
// focus returns to whatever was focused before when it closes.
//
// friendlyError(err, t) turns raw server messages ("Forbidden", "Request failed
// (500)", "Failed to fetch"...) into a plain translated sentence.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { C } from "../lib/score.js";
import { useI18n } from "../lib/i18n.jsx";

const DialogContext = createContext(null);
const DANGER = "#b3261e";

// ---- error mapping ----------------------------------------------------------
const ERROR_RULES = [
  [/already taken/i, "err.codeTaken"],
  [/only the event owner/i, "err.ownerOnly"],
  [/doesn't look like an email|valid email/i, "err.badEmail"],
  [/already own this event/i, "err.cohostSelf"],
  [/co-hosts per event/i, "err.cohostMax"],
  [/name and code are required/i, "err.nameCode"],
  [/unauthori[sz]ed|\(401\)|\bjwt\b|not signed in/i, "err.signin"],
  [/forbidden|\(403\)|not allowed|permission/i, "err.forbidden"],
  [/too large|\(413\)/i, "err.tooLarge"],
  [/failed to fetch|load failed|networkerror|network request failed|offline/i, "err.network"],
  [/upload failed/i, "err.upload"],
  [/not found|\(404\)/i, "err.notFound"],
  [/\((5\d\d)\)|internal server error|could not sign upload/i, "err.server"],
];
export function friendlyError(err, t) {
  const msg = String((err && (err.message || err.error)) || err || "");
  const status = Number(err && err.status);
  if (status === 401) return t("err.signin");
  if (status === 403) return t("err.forbidden");
  for (const [re, key] of ERROR_RULES) if (re.test(msg)) return t(key);
  if (msg) console.warn("HALO error:", msg);
  return t("err.generic");
}

// ---- icons (flat, inline) ---------------------------------------------------
function ToastIcon({ kind }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "error") return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></svg>;
  if (kind === "success") return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5" /><path d="M12 7.5h.01" /></svg>;
}

// ---- the dialog card --------------------------------------------------------
function DialogCard({ d, onClose, t }) {
  const cardRef = useRef(null);
  const inputRef = useRef(null);
  const [value, setValue] = useState(d.defaultValue || "");
  const isPrompt = d.type === "prompt";
  const isAlert = d.type === "alert";
  const cancelValue = isPrompt ? null : isAlert ? undefined : false;

  const cancel = useCallback(() => onClose(cancelValue), [onClose, cancelValue]);
  const ok = () => onClose(isPrompt ? value : isAlert ? undefined : true);

  // Initial focus: the text box for prompts; Cancel for destructive confirms
  // (so a stray Enter can't delete anything); otherwise the main button.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const target = isPrompt ? inputRef.current
      : el.querySelector(d.danger && !isAlert ? "[data-dlg-cancel]" : "[data-dlg-ok]");
    (target || el).focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); return; }
    if (e.key === "Tab") {
      const items = Array.from(cardRef.current.querySelectorAll("button, input, [href], [tabindex]:not([tabindex='-1'])")).filter((n) => !n.disabled);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  const titleId = `halo-dlg-title-${d.id}`;
  const msgId = `halo-dlg-msg-${d.id}`;
  const btn = { minHeight: 44, padding: "10px 18px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", flex: "1 1 120px" };
  const okDisabled = isPrompt && d.required !== false && !String(value).trim();

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(6,3,11,.72)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 16, animation: "haloDlgFade .14s ease-out" }}>
      <div ref={cardRef} role={isAlert ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={d.title ? titleId : undefined} aria-describedby={d.message ? msgId : undefined}
        tabIndex={-1} onKeyDown={onKeyDown}
        style={{ width: "100%", maxWidth: 420, background: C.card, color: C.text, border: `1px solid ${d.danger ? "rgba(179,38,30,.55)" : C.line2}`, borderRadius: 18, padding: "20px 18px 16px", boxShadow: "0 24px 60px rgba(0,0,0,.55)", outline: "none", animation: "haloDlgPop .16s ease-out", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>
        {d.title && <h2 id={titleId} style={{ margin: "0 0 8px", fontSize: 18, lineHeight: 1.3, fontWeight: 800, color: d.danger ? "#ff8a80" : C.text, overflowWrap: "anywhere" }}>{d.title}</h2>}
        {d.message && <p id={msgId} style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: d.title ? C.second : C.text, whiteSpace: "pre-line", overflowWrap: "anywhere" }}>{d.message}</p>}
        <form onSubmit={(e) => { e.preventDefault(); if (!okDisabled) ok(); }}>
          {isPrompt && (
            <input ref={inputRef} value={value} onChange={(e) => setValue(e.target.value)} placeholder={d.placeholder || ""}
              aria-label={d.inputLabel || d.title || d.message || ""} autoComplete="off" autoCapitalize={d.autoCapitalize || "off"} spellCheck={false}
              style={{ width: "100%", marginTop: 14, minHeight: 44, padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.line2}`, background: "rgba(255,255,255,.05)", color: C.text, fontSize: 16 }} />
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap-reverse" }}>
            {!isAlert && (
              <button type="button" data-dlg-cancel onClick={cancel}
                style={{ ...btn, background: "transparent", color: C.text, border: `1px solid ${C.line2}` }}>{d.cancelLabel || t("dlg.cancel")}</button>
            )}
            <button type="submit" data-dlg-ok disabled={okDisabled}
              style={{ ...btn, border: "none", background: d.danger ? DANGER : C.gold, color: d.danger ? "#fff" : C.ink, opacity: okDisabled ? 0.5 : 1, cursor: okDisabled ? "default" : "pointer" }}>
              {d.confirmLabel || (isAlert ? t("dlg.ok") : t("dlg.confirm"))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- provider ---------------------------------------------------------------
export function DialogProvider({ children }) {
  const { t } = useI18n();
  const [queue, setQueue] = useState([]);   // pending dialogs; queue[0] is shown
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);
  const lastFocus = useRef(null);
  const current = queue[0] || null;

  const open = useCallback((type, opts) => new Promise((resolve) => {
    const o = typeof opts === "string" ? { message: opts } : (opts || {});
    seq.current += 1;
    setQueue((q) => [...q, { ...o, type, id: seq.current, resolve }]);
  }), []);

  const close = useCallback((result) => {
    setQueue((q) => {
      if (!q.length) return q;
      q[0].resolve(result);
      return q.slice(1);
    });
  }, []);

  // Remember / restore focus and stop the page scrolling behind the dialog.
  useEffect(() => {
    if (!current) return;
    if (!lastFocus.current) lastFocus.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [current]);
  useEffect(() => {
    if (current || !lastFocus.current) return;
    const el = lastFocus.current; lastFocus.current = null;
    try { if (el && el.isConnected && el.focus) el.focus(); } catch {}
  }, [current]);

  const toast = useCallback((message, kind = "info") => {
    if (!message) return;
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list.slice(-2), { id, message: String(message), kind }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3200);
  }, []);
  const dismissToast = (id) => setToasts((list) => list.filter((x) => x.id !== id));

  const api = useRef(null);
  if (!api.current) {
    api.current = {
      confirm: (o) => open("confirm", o),
      prompt: (o) => open("prompt", o),
      alert: (o) => open("alert", o),
    };
  }
  api.current.toast = toast;

  return (
    <DialogContext.Provider value={api.current}>
      {children}
      <style>{`@keyframes haloDlgFade{from{opacity:0}to{opacity:1}}@keyframes haloDlgPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}@keyframes haloToastIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){[data-halo-dlg] *{animation:none!important}}`}</style>
      <div data-halo-dlg>
        {current && <DialogCard key={current.id} d={current} onClose={close} t={t} />}
        <div aria-live="polite" role="status"
          style={{ position: "fixed", left: 16, right: 16, bottom: "max(16px, env(safe-area-inset-bottom))", zIndex: 3100, display: "grid", justifyItems: "center", gap: 8, pointerEvents: "none" }}>
          {toasts.map((x) => (
            <div key={x.id} onClick={() => dismissToast(x.id)}
              style={{ pointerEvents: "auto", cursor: "pointer", maxWidth: 440, width: "fit-content", display: "flex", alignItems: "center", gap: 10, background: C.card, color: C.text, border: `1px solid ${x.kind === "error" ? "rgba(179,38,30,.7)" : x.kind === "success" ? C.gold : C.line2}`, borderRadius: 14, padding: "11px 14px", fontSize: 13.5, lineHeight: 1.4, boxShadow: "0 12px 32px rgba(0,0,0,.5)", animation: "haloToastIn .18s ease-out", overflowWrap: "anywhere" }}>
              <span style={{ flexShrink: 0, display: "grid", color: x.kind === "error" ? "#ff8a80" : C.gold }}><ToastIcon kind={x.kind} /></span>
              <span>{x.message}</span>
            </div>
          ))}
        </div>
      </div>
    </DialogContext.Provider>
  );
}

// Fallback outside the provider (should not happen once mounted at the root):
// plain browser boxes so nothing crashes.
const FALLBACK = {
  confirm: async (o) => window.confirm([o?.title, o?.message].filter(Boolean).join("\n\n")),
  prompt: async (o) => window.prompt([o?.title, o?.message].filter(Boolean).join("\n\n"), o?.defaultValue || ""),
  alert: async (o) => { window.alert([o?.title, o?.message].filter(Boolean).join("\n\n")); },
  toast: (m) => { if (m) console.info(m); },
};

export function useDialogs() {
  return useContext(DialogContext) || FALLBACK;
}
