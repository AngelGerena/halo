// HALO — events the signed-in user co-hosts (invited by email). The dashboard
// adds these to the user's own events. Returns { events: [...] }.
import { createClient } from "@supabase/supabase-js";
import { authenticate } from "./_auth.js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const auth = await authenticate(event);
  if (!auth.ok || !auth.email) return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [] }) };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const { data: rows, error } = await supabase.from("event_cohosts").select("event_id").eq("email", auth.email);
    if (error) throw error;
    const ids = [...new Set((rows || []).map((r) => r.event_id))];
    if (!ids.length) return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [] }) };
    const { data: events, error: e2 } = await supabase.from("events").select("*").in("id", ids).order("created_at", { ascending: false });
    if (e2) throw e2;
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: (events || []).map((e) => ({ ...e, _cohost: true })) }) };
  } catch {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [] }) }; // table not created yet
  }
}
