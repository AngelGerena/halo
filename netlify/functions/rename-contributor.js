// HALO — a guest sets (or fixes) their name after they've already added
// photos. Guests have no account, and contributor ids are public (they show
// up in gallery links and API reads), so the id alone is NOT proof of who is
// asking. Each guest's phone keeps a private `secret` created when they joined
// (supabase/privacy-guards.sql); only a matching secret may rename the guest
// or set their email.
//
// Guests who joined before secrets existed (secret is empty in the database)
// can still claim their row once: only while it is still called "Guest" (or
// blank), and an email can only be added if none is on file yet.
//
// Lead capture (events.lead_capture on): the guest may also send `phone` and
// `marketing_ok` under the same secret rule. Both are validated here and are
// never sent back to the browser (the reply is only id + name).
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Accepts "+1 (555) 123-4567", "555.123.4567" etc; stores "+15551234567" / "5551234567".
function normPhone(v) {
  const s = String(v).trim();
  if (!s) return "";
  if (s.length > 32 || !/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return (s.startsWith("+") ? "+" : "") + digits;
}
// Missing-column errors (event-extras.sql not run yet): retry without lead fields.
const leadColMissing = (e) => !!e && /phone|marketing_ok/i.test(e.message || "");

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function sameSecret(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (!x.length || x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const contributorId = String(b.contributorId || "");
  const name = String(b.name || "").trim().slice(0, 80);
  const email = b.email ? String(b.email).trim().slice(0, 160) : null;
  const secret = b.secret ? String(b.secret).slice(0, 200) : "";
  if (!/^[0-9a-f-]{36}$/i.test(contributorId)) return json(400, { error: "contributorId required" });
  if (!name) return json(400, { error: "name required" });

  // Lead fields: only present when the event collects leads. Validate them
  // (and the email, in that case) before touching the database.
  const hasLead = "phone" in b || "marketing_ok" in b;
  let phone = null, marketingOk;
  if (hasLead) {
    if (email && (email.length > 160 || !EMAIL_RE.test(email))) return json(400, { error: "Invalid email" });
    if (b.phone != null && b.phone !== "") {
      phone = normPhone(b.phone);
      if (!phone) return json(400, { error: "Invalid phone" });
    }
    if ("marketing_ok" in b) {
      if (typeof b.marketing_ok !== "boolean") return json(400, { error: "Invalid marketing_ok" });
      marketingOk = b.marketing_ok;
    }
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Read the current row (service role). If the privacy-guards SQL has not
  // been run yet there is no `secret` column; treat every guest as legacy.
  let row = null;
  {
    const { data, error } = await supabase.from("contributors").select("id,name,email,secret").eq("id", contributorId).maybeSingle();
    if (error && /secret/i.test(error.message || "")) {
      const r2 = await supabase.from("contributors").select("id,name,email").eq("id", contributorId).maybeSingle();
      if (r2.error) return json(500, { error: "Could not load guest" });
      row = r2.data ? { ...r2.data, secret: null } : null;
    } else if (error) {
      return json(500, { error: "Could not load guest" });
    } else {
      row = data;
    }
  }
  if (!row) return json(404, { error: "Not found" });

  const patch = { name };
  if (row.secret) {
    if (!sameSecret(secret, row.secret)) return json(403, { error: "Not allowed" });
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (marketingOk !== undefined) patch.marketing_ok = marketingOk;
  } else {
    const current = String(row.name || "").trim().toLowerCase();
    if (current && current !== "guest") return json(403, { error: "Not allowed" });
    if (email && !row.email) patch.email = email;
    // Same one-time claim for lead fields: a phone only if none is on file.
    if (phone || marketingOk !== undefined) {
      const { data: cur, error: pe } = await supabase.from("contributors").select("phone").eq("id", contributorId).maybeSingle();
      if (!pe) {
        if (phone && !(cur && cur.phone)) patch.phone = phone;
        if (marketingOk !== undefined) patch.marketing_ok = marketingOk;
      }
    }
  }

  let { data, error } = await supabase.from("contributors").update(patch).eq("id", contributorId).select("id,name").single();
  if (error && leadColMissing(error) && ("phone" in patch || "marketing_ok" in patch)) {
    const { phone: _p, marketing_ok: _m, ...rest } = patch;
    ({ data, error } = await supabase.from("contributors").update(rest).eq("id", contributorId).select("id,name").single());
  }
  if (error || !data) return json(404, { error: "Not found" });
  return json(200, { contributor: data });
}
