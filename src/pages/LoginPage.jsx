import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError, authErrorText } from "../components/AuthUI.jsx";
import { useI18n } from "../lib/i18n.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

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
      // The client dashboard is built by another agent; just hand off to it.
      navigate("/dashboard");
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
