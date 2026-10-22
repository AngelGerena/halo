import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError } from "../components/AuthUI.jsx";

export default function SignUpPage() {
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

    if (!fullName.trim()) { setErr("Please enter your full name."); return; }
    if (!email.trim()) { setErr("Please enter your email."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }

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
      fetch("/.netlify/functions/welcome-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: fullName.trim(), needsConfirm }),
      }).catch(() => {});
    } catch (e2) {
      setErr(e2?.message || "Could not create your account. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="HALO Accounts"
        title={done === "in" ? "You're in" : "Check your email"}
        sub={
          done === "in"
            ? "Your account is ready. You can head to your dashboard now."
            : `We sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`
        }
      >
        <Link to="/login" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="HALO Accounts"
      title="Create your account"
      sub="One account to create events, curate galleries, and share them with your clients."
    >
      <form onSubmit={submit} noValidate>
        <AuthField label="Full name">
          <input
            className="field"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Angel Gerena"
          />
        </AuthField>

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

        <AuthField label="Password" hint="At least 6 characters.">
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
          />
        </AuthField>

        {err && <AuthError>{err}</AuthError>}

        <AuthButton busy={busy} busyLabel="Creating account…">
          Create account
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: C.gold, fontWeight: 600 }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
