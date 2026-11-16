// HALO: one-tap co-host invite.
//
// The invite email links to /dashboard?event=CODE&invite=TOKEN. This gate
// sits in front of the dashboard's sign-in check: it trades the token for a
// session (no password, no sign-up form), waits for the session to land, then
// lets the dashboard open the event. A bad or removed invite just falls
// through to the normal sign-in page; an expired one offers a fresh email.
import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/auth.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { Spinner } from "./UI.jsx";

async function redeem(body) {
  const r = await fetch("/.netlify/functions/cohost-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || "failed");
  return j;
}

export default function InviteGate({ children }) {
  const { user, loading } = useAuth();
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  // Read the token once; it is removed from the address bar as soon as it is used.
  const [token] = useState(() => params.get("invite") || "");
  // working -> (wait ->) pass | expired -> sent
  const [state, setState] = useState(token ? "working" : "pass");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const started = useRef(false);

  const dropToken = () => setParams((p) => { const n = new URLSearchParams(p); n.delete("invite"); return n; }, { replace: true });

  useEffect(() => {
    if (!token || loading || started.current) return;
    started.current = true;
    (async () => {
      try {
        const j = await redeem({ token });
        if (j.status === "ok" && j.token_hash) {
          const invited = String(j.email || "").toLowerCase();
          // Already signed in as the invited person? Nothing to do.
          if ((user?.email || "").toLowerCase() !== invited) {
            const { error } = await supabase.auth.verifyOtp({ token_hash: j.token_hash, type: "email" });
            if (error) throw error;
          }
          setEmail(invited);
          dropToken();
          setState("wait");
        } else if (j.status === "expired") {
          setState("expired");
        } else {
          dropToken();
          setState("pass");
        }
      } catch {
        dropToken();
        setState("pass");
      }
    })();
  }, [token, loading]);

  // Hold the dashboard back until the new session has reached the auth
  // context, otherwise its sign-in check would bounce them to /login.
  useEffect(() => {
    if (state !== "wait") return;
    if ((user?.email || "").toLowerCase() === email) { setState("pass"); return; }
    const id = setTimeout(() => setState("pass"), 8000);
    return () => clearTimeout(id);
  }, [state, user, email]);

  async function resend() {
    if (busy) return;
    setBusy(true); setErr(false);
    try {
      const j = await redeem({ token, resend: true, lang });
      if (j.status !== "resent") throw new Error("failed");
      setState("sent");
    } catch { setErr(true); } finally { setBusy(false); }
  }

  if (state === "pass") return children;

  if (state === "expired" || state === "sent") {
    const sent = state === "sent";
    return (
      <div style={{ maxWidth: 440, margin: "0 auto", padding: "56px 4px 40px", textAlign: "center" }}>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 400, fontSize: "clamp(34px,9vw,46px)", lineHeight: 1, letterSpacing: ".02em", margin: 0, color: "#fff" }}>
          {t(sent ? "invite.sent.t" : "invite.expired.t")}
        </h1>
        <p style={{ color: "#c6cad8", fontSize: 15, lineHeight: 1.6, margin: "14px 0 24px" }}>
          {t(sent ? "invite.sent.b" : "invite.expired.b")}
        </p>
        {!sent && (
          <button className="ps-btn a" onClick={resend} disabled={busy} style={{ width: "100%", minHeight: 52, fontSize: 15, opacity: busy ? 0.7 : 1 }}>
            {busy ? t("invite.sending") : t("invite.resend")}
          </button>
        )}
        {err && <p role="alert" style={{ color: "#ff8a80", fontSize: 13.5, margin: "12px 0 0" }}>{t("invite.err")}</p>}
        <p style={{ margin: "18px 0 0", fontSize: 13.5 }}>
          <Link to="/login" style={{ color: "var(--gold-light)", fontWeight: 600 }}>{t("invite.signIn")}</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner label={t("invite.opening")} />
    </div>
  );
}
