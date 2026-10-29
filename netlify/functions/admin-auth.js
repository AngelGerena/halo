// Verifies the super-admin passcode without exposing it to the browser.
// The passcode lives only in the Netlify env (ADMIN_PASSCODE).
// Constant-time compare and a per-IP limit of 5 wrong tries per 10 minutes.
import { checkPasscode } from "./_auth.js";
import { tooMany } from "./_ratelimit.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  let passcode = "";
  try { passcode = JSON.parse(event.body || "{}").passcode || ""; } catch {}

  const result = checkPasscode(event, passcode);
  if (result === "unset") return { statusCode: 500, body: JSON.stringify({ error: "Admin passcode not configured." }) };
  if (result === "limited") return tooMany();
  if (result === "ok") return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
}
