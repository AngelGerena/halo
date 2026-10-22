// HALO — shared auth helper for Netlify functions.
//
// Phase 1 accounts migration: event/photo functions move from a single shared
// admin passcode to per-user Supabase sessions + ownership verification.
//
// authenticate(event) resolves the caller to one of:
//   - a transitional passcode admin (ADMIN_PASSCODE override — keeps the current
//     admin UI working until the new session-based UI ships), or
//   - an authenticated Supabase user (verified via their access-token JWT), whose
//     profiles.is_admin flag decides app-global admin rights.
//
// The frontend sends the user's Supabase ACCESS TOKEN (JWT) either as an
// `Authorization: Bearer <jwt>` header (preferred) or a `token` field in the
// JSON body. Both are supported here, header first.
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Used to verify the JWT and to read the
// caller's profile / an event's owner_id regardless of row-level policies.
function serviceClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Pull the bearer token from the Authorization header (preferred) or body.token.
function readToken(event, body) {
  const headers = event.headers || {};
  // Netlify lowercases header names, but be defensive about casing.
  const raw = headers.authorization || headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  if (m && m[1]) return m[1].trim();
  if (body && typeof body.token === "string" && body.token) return body.token.trim();
  return "";
}

/**
 * Authenticate a request.
 * @returns {Promise<{ok:boolean, isAdmin:boolean, userId:(string|null), viaPasscode:boolean}>}
 *
 *   { ok:false }                                               -> no valid credential
 *   { ok:true, isAdmin:true,  userId:null,  viaPasscode:true } -> transitional passcode admin
 *   { ok:true, isAdmin:bool,  userId:<uuid>, viaPasscode:false } -> authenticated user
 */
export async function authenticate(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  // 1) Transitional admin override — the shared passcode still works so the
  //    current admin UI doesn't break mid-migration.
  if (body.passcode && process.env.ADMIN_PASSCODE && body.passcode === process.env.ADMIN_PASSCODE) {
    return { ok: true, isAdmin: true, userId: null, viaPasscode: true };
  }

  // 2) Session-based auth — verify the caller's Supabase access-token JWT.
  const jwt = readToken(event, body);
  if (!jwt) return { ok: false, isAdmin: false, userId: null, viaPasscode: false };

  const supabase = serviceClient();
  const { data, error } = await supabase.auth.getUser(jwt);
  const user = data && data.user;
  if (error || !user) return { ok: false, isAdmin: false, userId: null, viaPasscode: false };

  // Look up the admin flag from the profile. A missing row -> not an admin.
  let isAdmin = false;
  try {
    const { data: profile } = await supabase
      .from("profiles").select("is_admin").eq("id", user.id).single();
    isAdmin = !!(profile && profile.is_admin);
  } catch { isAdmin = false; }

  return { ok: true, isAdmin, userId: user.id, viaPasscode: false };
}

/**
 * Owner-or-admin check for a given event.
 * @param {object} supabase  a service-role Supabase client (bypasses RLS)
 * @param {string} eventId   the target event id
 * @param {object} auth      the result of authenticate()
 * @returns {Promise<boolean>} true if auth is admin, or owns the event
 */
export async function ownsEventOrAdmin(supabase, eventId, auth) {
  if (!auth || !auth.ok) return false;
  if (auth.isAdmin) return true;            // app-global admins own everything
  if (!auth.userId || !eventId) return false;

  const { data: ev, error } = await supabase
    .from("events").select("owner_id").eq("id", eventId).single();
  if (error || !ev) return false;
  return ev.owner_id === auth.userId;
}
