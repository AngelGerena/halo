// Lightweight translation helper for the create-event form.
// Uses Google's free translate endpoint (no API key). Returns a SUGGESTION
// that the admin reviews and can edit before saving — so a bad machine
// translation never reaches the congregation unedited.
// Passcode-gated to prevent abuse of the endpoint.

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, items, from = "en", to = "es" } = b;

  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  if (!items || typeof items !== "object") {
    return { statusCode: 400, body: JSON.stringify({ error: "items object required" }) };
  }

  const out = {};
  for (const [key, text] of Object.entries(items)) {
    const clean = (text || "").trim();
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
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("translate failed");
  const data = await res.json();
  // response shape: [[[ "translated", "original", ... ], ...], ...]
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((seg) => (seg && seg[0]) || "").join("");
  }
  throw new Error("unexpected shape");
}
