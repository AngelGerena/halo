import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError } from "../components/AuthUI.jsx";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");

    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }

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
      setErr(e2?.message || "Could not sign you in. Check your details and try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="HALO Accounts"
      title="Welcome back"
      sub="Sign in to manage your events and galleries."
    >
      <form onSubmit={submit} noValidate>
        <AuthField label="Email">
          <input
            className="field"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </AuthField>

        <AuthField label="Password">
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
          />
        </AuthField>

        <div style={{ textAlign: "right", margin: "-6px 0 16px" }}>
          <Link to="/reset" style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>
            Forgot password?
          </Link>
        </div>

        {err && <AuthError>{err}</AuthError>}

        <AuthButton busy={busy} busyLabel="Signing in…">
          Sign in
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        New to HALO?{" "}
        <Link to="/signup" style={{ color: C.gold, fontWeight: 600 }}>Create an account</Link>
      </p>
    </AuthShell>
  );
}
