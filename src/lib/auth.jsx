// HALO auth — PLACEHOLDER.
//
// This is a minimal stand-in so the client dashboard compiles and builds on its
// own worktree branch. The real implementation is owned by the auth agent and
// MUST replace this file on integration. Keep the SAME public API:
//
//   <AuthProvider>            — context provider wrapping the app
//   useAuth()                 — returns { user, session, loading, signOut }
//   <RequireAuth>…</RequireAuth> — gate that renders children only when signed in
//
// The placeholder reads/writes the Supabase session directly so that, if the
// auth agent's version is late, a dashboard still behaves correctly against a
// real signed-in Supabase session during manual testing.
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session || null);
      setLoading(false);
    }).catch(() => { if (active) setLoading(false); });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s || null);
    });
    return () => { active = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  async function signOut() {
    try { await supabase.auth.signOut(); } catch { /* ignore */ }
    setSession(null);
  }

  const value = { user: session?.user || null, session, loading, signOut };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // No provider mounted — report "not signed in, not loading" so gates resolve.
    return { user: null, session: null, loading: false, signOut: async () => {} };
  }
  return ctx;
}

// Renders children only for a signed-in user. While the session is resolving it
// shows `fallback` (or nothing). When signed out it shows `signedOut` (or, by
// default, sends the browser to /login).
export function RequireAuth({ children, fallback = null, signedOut = null }) {
  const { user, loading } = useAuth();
  if (loading) return fallback;
  if (!user) {
    if (signedOut) return signedOut;
    if (typeof window !== "undefined") window.location.replace("/login");
    return null;
  }
  return children;
}
