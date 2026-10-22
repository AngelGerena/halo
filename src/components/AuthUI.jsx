import React from "react";
import { C } from "../lib/score.js";
import { Header, Footer } from "./UI.jsx";

// Shared chrome for the auth pages (sign up / login / reset). Keeps the
// dark-cinematic brand consistent and the layout mobile-first: tight top
// spacing on phones, a single centered card, no horizontal overflow.

export function AuthShell({ eyebrow, title, sub, children }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />
      <main
        className="wrap"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 24,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: C.card,
            border: "1px solid rgba(255,255,255,.1)",
            borderRadius: 18,
            padding: "26px 24px 28px",
            boxShadow: "0 18px 50px rgba(0,0,0,.4)",
          }}
        >
          {eyebrow && (
            <div
              style={{
                display: "inline-flex",
                padding: "5px 12px",
                borderRadius: 999,
                background: C.ink,
                color: C.gold,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1 className="serif" style={{ fontSize: 30, color: C.text, margin: "14px 0 6px", lineHeight: 1.05 }}>
            {title}
          </h1>
          {sub && <p style={{ fontSize: 14, color: C.second, margin: "0 0 20px", lineHeight: 1.5 }}>{sub}</p>}
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
}

export function AuthField({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 7 }}>
        {label}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: C.second, marginTop: 6 }}>{hint}</span>}
    </label>
  );
}

export function AuthButton({ busy, busyLabel, children, ...rest }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="btn-gold btn-full"
      style={{ marginTop: 4, opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
      {...rest}
    >
      {busy ? busyLabel || "Please wait…" : children}
    </button>
  );
}

export function AuthError({ children }) {
  return (
    <div
      role="alert"
      style={{
        background: "rgba(255,61,129,.12)",
        border: "1px solid rgba(255,61,129,.4)",
        color: "#ff9bbf",
        fontSize: 13,
        lineHeight: 1.5,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

export function AuthNote({ children }) {
  return (
    <div
      style={{
        background: "rgba(0,194,203,.1)",
        border: "1px solid rgba(0,194,203,.35)",
        color: "#8fe6ea",
        fontSize: 13,
        lineHeight: 1.5,
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}
