// HALO — authentication helper for Netlify functions.
//
// ⚠️ PLACEHOLDER. The real _auth.js is owned by the HALO Accounts (Phase 1)
// agent. This minimal stub exists only so the Stripe pre-wiring functions can
// import { authenticate } and node --check / the build pass in this worktree.
// If the real _auth.js lands first, this file should be overwritten by it —
// the exported signature below is the contract both must honor:
//
//   authenticate(event) -> Promise<{ ok: boolean, isAdmin: boolean, userId: string|null }>
//
// It inspects the Netlify function `event` (headers/body) and resolves the
// caller. This placeholder recognizes two things so dependent functions can be
// exercised safely:
//   1. A Bearer Supabase access token in the Authorization header — verified
//      against Supabase if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
//   2. The super-admin passcode (ADMIN_PASSCODE) in the body or an
//      `x-admin-passcode` header — treated as an admin caller.
//
// When it can't verify anyone it returns { ok:false, isAdmin:false, userId:null }
// rather than throwing, so callers decide how to respond.

import { createClient } from "@supabase/supabase-js";

function bearerToken(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1] : null;
}

function adminPasscode(event) {
  const h = event.headers || {};
  if (h["x-admin-passcode"]) return h["x-admin-passcode"];
  if (h["X-Admin-Passcode"]) return h["X-Admin-Passcode"];
  try {
    const b = JSON.parse(event.body || "{}");
    if (b && b.passcode) return b.passcode;
  } catch {}
  return null;
}

export async function authenticate(event) {
  const result = { ok: false, isAdmin: false, userId: null };

  // 1. Super-admin passcode path.
  const pass = adminPasscode(event);
  if (pass && process.env.ADMIN_PASSCODE && pass === process.env.ADMIN_PASSCODE) {
    return { ok: true, isAdmin: true, userId: null };
  }

  // 2. Supabase Bearer token path (best-effort; no crash if unconfigured).
  const token = bearerToken(event);
  if (token && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data && data.user) {
        return { ok: true, isAdmin: false, userId: data.user.id };
      }
    } catch (e) {
      console.error("auth verify warning:", e && e.message);
    }
  }

  return result;
}
