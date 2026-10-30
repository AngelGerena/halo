import React, { useState } from "react";
import ResendConfirm from "../components/ResendConfirm.jsx";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError, authErrorText } from "../components/AuthUI.jsx";
import { useI18n } from "../lib/i18n.jsx";

export default function SignUpPage() {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null); // null | "verify" | "in"

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");

    if (!fullName.trim()) { setErr("auth.err.name"); return; }
    if (!email.trim()) { setErr("auth.err.email"); return; }
    if (password.length < 6) { setErr("auth.err.short"); return; }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });
      if (error) throw error;
      // If email confirmation is on, there's a user but no session yet.
      // If it's off, Supabase returns an active session and they're straight in.
      const needsConfirm = !data?.session;
      setDone(needsConfirm ? "verify" : "in");

      // Fire a warm welcome + getting-started email (separate from Supabase's
      // own confirm link). Best-effort and non-blocking: if it fails, the
      // account is still created and the user still sees the success screen.
      // Only the new account's id is sent; the server looks up the address.
      if (data?.user?.id) fetch("/.netlify/functions/welcome-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      }).catch(() => {});
    } catch (e2) {
      setErr(e2?.message || "auth.err.signup");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        title={done === "in" ? t("signup.inTitle") : t("auth.checkEmail")}
        sub={done === "in" ? t("signup.inSub") : t("signup.verifySub").replace("{email}", email.trim())}
      >
        <Link to="/login" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          {t("auth.goSignIn")}
        </Link>
        {done === "verify" && <ResendConfirm email={email} />}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("signup.title")}
      sub={t("signup.sub")}
    >
      <form onSubmit={submit} noValidate>
        <AuthField label={t("signup.name")}>
          <input
            className="field"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("signup.namePh")}
          />
        </AuthField>

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

        <AuthField label={t("auth.password")} hint={t("auth.min6")}>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("signup.pwPh")}
          />
        </AuthField>

        {err && <AuthError>{authErrorText(err, t)}</AuthError>}

        <AuthButton busy={busy} busyLabel={t("signup.busy")}>
          {t("signup.btn")}
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        {t("signup.have")}{" "}
        <Link to="/login" style={{ color: C.gold, fontWeight: 600 }}>{t("auth.signIn")}</Link>
      </p>
    </AuthShell>
  );
}
