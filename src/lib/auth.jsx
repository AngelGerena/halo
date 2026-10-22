import React, { createContext, useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
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

// Route guard: render children only when signed in. While the session is still
// loading, show a spinner; if resolved and signed out, redirect to /login.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}
