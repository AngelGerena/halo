import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError, AuthNote, authErrorText } from "../components/AuthUI.jsx";
import { useI18n } from "../lib/i18n.jsx";

// Two modes on one component:
//   mode="request"  -> /reset         : email field, sends the reset link.
//   mode="confirm"  -> /reset-confirm : lands here from the email link with a
//                       recovery session, lets the user set a new password.
export default function ResetPasswordPage({ mode = "request" }) {
  if (mode === "confirm") return <ConfirmReset />;
  return <RequestReset />;
}

function RequestReset() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");
    if (!email.trim()) { setErr("auth.err.email"); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-confirm",
      });
      if (error) throw error;
      setSent(true);
    } catch (e2) {
      setErr(e2?.message || "auth.err.reset");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        title={t("auth.checkEmail")}
        sub={t("reset.sentSub").replace("{email}", email.trim())}
      >
        <Link to="/login" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          {t("auth.backSignIn")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("reset.title")}
      sub={t("reset.sub")}
    >
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

        {err && <AuthError>{authErrorText(err, t)}</AuthError>}

        <AuthButton busy={busy} busyLabel={t("reset.busy")}>
          {t("reset.btn")}
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        {t("reset.remembered")}{" "}
        <Link to="/login" style={{ color: C.gold, fontWeight: 600 }}>{t("auth.signIn")}</Link>
      </p>
    </AuthShell>
  );
}

function ConfirmReset() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);   // recovery session detected?
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;

    // detectSessionInUrl (set on the client) reads the recovery token from the
    // URL and fires a PASSWORD_RECOVERY event; the session is then available.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });

    // Also check directly in case the event already fired before we mounted.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data?.session) setReady(true);
      setChecking(false);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");
    if (password.length < 6) { setErr("auth.err.short"); return; }
    if (password !== confirm) { setErr("auth.err.match"); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (e2) {
      setErr(e2?.message || "auth.err.update");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        title={t("reset.doneTitle")}
        sub={t("reset.doneSub")}
      >
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="btn-gold btn-full"
          style={{ marginTop: 6 }}
        >
          {t("auth.goSignIn")}
        </button>
      </AuthShell>
    );
  }

  if (checking) {
    return (
      <AuthShell title={t("reset.checkingTitle")} sub={t("reset.checkingSub")}>
        <div style={{ height: 8 }} />
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell
        title={t("reset.badTitle")}
        sub={t("reset.badSub")}
      >
        <Link to="/reset" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          {t("reset.newLink")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("reset.setTitle")}
      sub={t("reset.setSub")}
    >
      <form onSubmit={submit} noValidate>
        <AuthNote>{t("reset.verified")}</AuthNote>

        <AuthField label={t("reset.newPw")} hint={t("auth.min6")}>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("reset.newPw")}
          />
        </AuthField>

        <AuthField label={t("reset.confirmPw")}>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t("reset.confirmPh")}
          />
        </AuthField>

        {err && <AuthError>{authErrorText(err, t)}</AuthError>}

        <AuthButton busy={busy} busyLabel={t("reset.updating")}>
          {t("reset.update")}
        </AuthButton>
      </form>
    </AuthShell>
  );
}
