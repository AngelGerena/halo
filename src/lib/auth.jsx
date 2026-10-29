import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "./supabase.js";
import { Spinner } from "../components/UI.jsx";

// HALO auth context.
// Tracks the current Supabase session/user so any page can read who is signed
// in without re-querying. The session carries the access token (JWT) that the
// service-role Netlify functions will verify server-side (see §6 of the
// accounts spec) — read it off `session.access_token`.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Load any persisted session on first mount.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session ?? null);
      setLoading(false);
    });

    // Keep the context in sync with every auth change (sign in/out, token
    // refresh, and the PASSWORD_RECOVERY event from the reset-confirm link).
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  const value = {
    user: session?.user ?? null,
    session,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Safe fallback if a component renders outside the provider.
    return { user: null, session: null, loading: false, signOut: async () => {} };
  }
  return ctx;
}

// Only allow a same-origin path as a post-login destination: it must start with
// a single "/" (no "//host" or "/\\host" protocol-relative tricks, no "http:").
export function safeNext(raw, fallback = "/dashboard") {
  if (typeof raw !== "string" || !raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(raw)) return fallback;
  return raw;
}

// Route guard: render children only when signed in. While the session is still
// loading, show a spinner; if resolved and signed out, redirect to /login and
// remember where they were going (path + query, e.g. /dashboard?event=CODE from
// a co-host invite or the morning-after email) so login can send them back.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!user) {
    const next = location.pathname + (location.search || "");
    const to = next && next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login";
    return <Navigate to={to} replace />;
  }
  return children;
}
