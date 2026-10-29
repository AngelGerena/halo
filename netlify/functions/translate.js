// Lightweight translation helper for the create-event form.
// Uses Google's free translate endpoint (no API key). Returns a SUGGESTION
// that the admin reviews and can edit before saving — so a bad machine
// translation never reaches the congregation unedited.
// Gated to signed-in users (any host) or the admin passcode, to prevent abuse.
import { authenticate } from "./_auth.js";

const LANG = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { items, from = "en", to = "es" } = b;

  // Accepts the dashboard's Supabase session (Bearer JWT) or the admin passcode.
  const auth = await authenticate(event);
  if (!auth.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!items || typeof items !== "object" || Array.isArray(items) || Object.keys(items).length > 20) {
    return { statusCode: 400, body: JSON.stringify({ error: "items object required (max 20 fields)" }) };
  }
  if (!LANG.test(String(from)) || !LANG.test(String(to))) {
    return { statusCode: 400, body: JSON.stringify({ error: "Unsupported language" }) };
  }

  const out = {};
  for (const [key, text] of Object.entries(items)) {
    const clean = String(text || "").trim().slice(0, 1000);
    if (!clean) { out[key] = ""; continue; }
    try {
      out[key] = await translateOne(clean, from, to);
    } catch {
      out[key] = ""; // leave blank on failure; admin can type it
    }
  }

  return { statusCode: 200, body: JSON.stringify({ translations: out }) };
}

async function translateOne(text, from, to) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("translate failed");
  const data = await res.json();
  // response shape: [[[ "translated", "original", ... ], ...], ...]
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((seg) => (seg && seg[0]) || "").join("");
  }
  throw new Error("unexpected shape");
}
