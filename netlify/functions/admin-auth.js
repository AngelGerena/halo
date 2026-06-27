// Verifies the super-admin passcode without exposing it to the browser.
// The passcode lives only in the Netlify env (ADMIN_PASSCODE).
export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  let passcode = "";
  try { passcode = JSON.parse(event.body || "{}").passcode || ""; } catch {}

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected) return { statusCode: 500, body: JSON.stringify({ error: "Admin passcode not configured." }) };

  if (passcode && passcode === expected) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }
  return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
}
