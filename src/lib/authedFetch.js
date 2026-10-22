// HALO — authenticated calls to Netlify functions for a signed-in client.
//
// Event mutations (create/update/delete/publish/moderate/tag/crop, upload
// signing, etc.) run through Netlify functions. For the client dashboard those
// functions authorize the caller by their Supabase JWT instead of the shared
// admin passcode. We send the session access token as a Bearer header; the
// function verifies it and derives the owner from it.
//
// INTEGRATION NOTE: another agent migrates the functions to accept this header.
// Until then these calls will 401 against the still-passcode-gated functions —
// expected, and reconciled when the function migration lands.

// Low-level: POST JSON to a Netlify function with the Bearer token attached.
// Returns the parsed JSON body (or {} for an empty body). Throws on non-2xx
// with the function's { error } message when present.
export async function postFn(session, name, body = {}) {
  const token = session?.access_token;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;

  const r = await fetch(`/.netlify/functions/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });

  const raw = await r.text();
  let j = {};
  try { j = raw ? JSON.parse(raw) : {}; } catch { /* non-JSON response */ }
  if (!r.ok) {
    const detail = j.error || (raw ? raw.slice(0, 180) : "");
    throw new Error(detail || `Request failed (${r.status})`);
  }
  return j;
}

// Build an `api` object bound to one session, so shared event-management
// components stay auth-strategy agnostic: they call api.fn("create-event", {...})
// and this module decides how the request is authorized.
export function makeApi(session) {
  return {
    session,
    fn: (name, body) => postFn(session, name, body),
    token: session?.access_token || null,
  };
}
