import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { C } from "../lib/score.js";
import { AuthShell, AuthField, AuthButton, AuthError, AuthNote } from "../components/AuthUI.jsx";

// Two modes on one component:
//   mode="request"  -> /reset         : email field, sends the reset link.
//   mode="confirm"  -> /reset-confirm : lands here from the email link with a
//                       recovery session, lets the user set a new password.
export default function ResetPasswordPage({ mode = "request" }) {
  if (mode === "confirm") return <ConfirmReset />;
  return <RequestReset />;
}

function RequestReset() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e?.preventDefault();
    if (busy) return;
    setErr("");
    if (!email.trim()) { setErr("Enter your email."); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/reset-confirm",
      });
      if (error) throw error;
      setSent(true);
    } catch (e2) {
      setErr(e2?.message || "Could not send the reset email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <AuthShell
        eyebrow="HALO Accounts"
        title="Check your email"
        sub={`If an account exists for ${email.trim()}, we sent a link to reset your password. Open it on this device to continue.`}
      >
        <Link to="/login" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="HALO Accounts"
      title="Reset your password"
      sub="Enter the email on your account and we'll send you a secure link to set a new password."
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

        {err && <AuthError>{err}</AuthError>}

        <AuthButton busy={busy} busyLabel="Sending link…">
          Send reset link
        </AuthButton>
      </form>

      <p style={{ textAlign: "center", color: C.second, fontSize: 13.5, marginTop: 18, marginBottom: 0 }}>
        Remembered it?{" "}
        <Link to="/login" style={{ color: C.gold, fontWeight: 600 }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}

function ConfirmReset() {
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
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setErr("Those passwords don't match."); return; }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (e2) {
      setErr(e2?.message || "Could not update your password. Request a fresh link and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell
        eyebrow="HALO Accounts"
        title="Password updated"
        sub="Your new password is set. You can sign in with it now."
      >
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="btn-gold btn-full"
          style={{ marginTop: 6 }}
        >
          Go to sign in
        </button>
      </AuthShell>
    );
  }

  if (checking) {
    return (
      <AuthShell eyebrow="HALO Accounts" title="Verifying link…" sub="One moment while we check your reset link." >
        <div style={{ height: 8 }} />
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell
        eyebrow="HALO Accounts"
        title="Link expired or invalid"
        sub="This reset link didn't check out — it may have expired or already been used. Request a new one and try again."
      >
        <Link to="/reset" className="btn-gold btn-full" style={{ marginTop: 6 }}>
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="HALO Accounts"
      title="Set a new password"
      sub="Choose a new password for your account."
    >
      <form onSubmit={submit} noValidate>
        <AuthNote>Your reset link is verified. Set your new password below.</AuthNote>

        <AuthField label="New password" hint="At least 6 characters.">
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
          />
        </AuthField>

        <AuthField label="Confirm password">
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter new password"
          />
        </AuthField>

        {err && <AuthError>{err}</AuthError>}

        <AuthButton busy={busy} busyLabel="Updating…">
          Update password
        </AuthButton>
      </form>
    </AuthShell>
  );
}
