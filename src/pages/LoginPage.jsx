import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError, authErrorText } from "../components/AuthUI.jsx";
import { useI18n } from "../lib/i18n.jsx";
import { safeNext } from "../lib/auth.jsx";
import ResendConfirm from "../components/ResendConfirm.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const [params] = useSearchParams();
  // Where to go after signing in (set by RequireAuth). Validated so it can only
  // ever be a path on this site, never an outside URL.
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // Arrived from an event link (e.g. an older co-host invite email, whose
  // button led here)? Offer a one-tap link by email instead of a password.
  const eventCode = (() => { try { return new URLSearchParams(next.split("?")[1] || "").get("event") || ""; } catch { return ""; } })();
  const [linkEmail, setLinkEmail] = useState("");
  const [linkState, setLinkState] = useState(""); // "" | busy | done | bad
  async function sendLink(e) {
    e?.preventDefault();
    if (linkState === "busy") return;
    const em = linkEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { setLinkState("bad"); return; }
    setLinkState("busy");
    try {
      await fetch("/.netlify/functions/cohost-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: true, email: em, code: eventCode, lang }),
      });
    } catch { /* same message either way */ }
    setLinkState("done");
  }

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");

    if (!email.trim() || !password) { setErr("auth.err.both"); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      // Back to where they were headed (e.g. /dashboard?event=CODE), else the dashboard.
      navigate(next, { replace: true });
    } catch (e2) {
      setErr(e2?.message || "auth.err.login");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={t("login.title")}
      sub={t("login.sub")}
    >
      {eventCode && (
        <div style={{ margin: "0 0 20px", padding: "16px 16px 18px", borderRadius: 16, border: "1px solid color-mix(in srgb, var(--gold) 55%, transparent)", background: "color-mix(in srgb, var(--gold) 9%, transparent)" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>{t("invite.ask.t")}</div>
          {linkState === "done" ? (
            <p role="status" style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.55, color: "#e7e3ee" }}>{t("invite.ask.done")}</p>
          ) : (
            <form onSubmit={sendLink} noValidate>
              <p style={{ margin: "6px 0 12px", fontSize: 13.5, lineHeight: 1.55, color: "#e7e3ee" }}>{t("invite.ask.b")}</p>
              <input
                className="field"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={linkEmail}
                onChange={(e) => { setLinkEmail(e.target.value); if (linkState === "bad") setLinkState(""); }}
                placeholder={t("auth.emailPh")}
                aria-label={t("auth.email")}
              />
              {linkState === "bad" && <p role="alert" style={{ color: "#ff8a80", fontSize: 13, margin: "8px 0 0" }}>{t("invite.ask.bad")}</p>}
              <div style={{ marginTop: 12 }}>
                <AuthButton busy={linkState === "busy"} busyLabel={t("invite.sending")}>{t("invite.ask.btn")}</AuthButton>
              </div>
            </form>
          )}
        </div>
      )}
      {eventCode && <p style={{ textAlign: "center", color: C.second, fontSize: 12.5, letterSpacing: ".04em", margin: "0 0 14px" }}>{t("invite.ask.or")}</p>}

      <form onSubmit={submit} noValidate>
        <AuthField label={t("auth.email")}>
          <input
            className="field"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPh")}
          />
        </AuthField>

        <AuthField label={t("auth.password")}>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("login.pwPh")}
          />
        </AuthField>

        <div style={{ textAlign: "right", margin: "-6px 0 16px" }}>
          <Link to="/reset" style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>
            {t("login.forgot")}
          </Link>
        </div>

        {err && <AuthError>{authErrorText(err, t)}</AuthError>}
        {err && err.toLowerCase().includes("not confirmed") && <div style={{ margin: "-4px 0 14px" }}><ResendConfirm email={email} /></div>}

        <AuthButton busy={busy} busyLabel={t("login.busy")}>
          {t("auth.signIn")}
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        {t("login.new")}{" "}
        <Link to="/signup" style={{ color: C.gold, fontWeight: 600 }}>{t("login.create")}</Link>
      </p>
    </AuthShell>
  );
}
