// HALO — host-only: the guests who left contact info at a lead-capture event
// (corporate events / galas). Owner, co-host or admin only. Returns every guest
// with an email or phone, including ones who did NOT agree to marketing
// (marketing_ok = false), so the host can tell them apart in the export.
//
// POST { eventId }  ->  { leads: [{ name, email, phone, marketing_ok, created_at }], count, marketing }
import { createClient } from "@supabase/supabase-js";
import { authenticate, ownsEventOrAdmin } from "./_auth.js";

const json = (statusCode, body) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const MAX_ROWS = 5000;

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const eventId = String(b.eventId || "");
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return json(400, { error: "eventId required" });

  const auth = await authenticate(event);
  if (!auth.ok) return json(401, { error: "Unauthorized" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!(await ownsEventOrAdmin(supabase, eventId, auth))) return json(403, { error: "Forbidden" });

  // If event-extras.sql has not been run yet there are no phone/marketing_ok
  // columns: fall back to email only.
  let rows = null;
  {
    const { data, error } = await supabase.from("contributors")
      .select("name,email,phone,marketing_ok,created_at").eq("event_id", eventId)
      .order("created_at", { ascending: true }).limit(MAX_ROWS);
    if (error && /phone|marketing_ok/i.test(error.message || "")) {
      const r2 = await supabase.from("contributors")
        .select("name,email,created_at").eq("event_id", eventId)
        .order("created_at", { ascending: true }).limit(MAX_ROWS);
      if (r2.error) return json(500, { error: "Could not load leads" });
      rows = (r2.data || []).map((r) => ({ ...r, phone: null, marketing_ok: false }));
    } else if (error) {
      return json(500, { error: "Could not load leads" });
    } else {
      rows = data || [];
    }
  }

  const leads = rows
    .filter((r) => (r.email && String(r.email).trim()) || (r.phone && String(r.phone).trim()))
    .map((r) => ({ name: r.name || "", email: r.email || "", phone: r.phone || "", marketing_ok: r.marketing_ok === true, created_at: r.created_at || null }));
  return json(200, { leads, count: leads.length, marketing: leads.filter((l) => l.marketing_ok).length });
}
