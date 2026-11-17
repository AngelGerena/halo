// HALO — events the signed-in user co-hosts (invited by email). The dashboard
// adds these to the user's own events. Returns { events: [...] }.
import { createClient } from "@supabase/supabase-js";
import { authenticate } from "./_auth.js";
import { albumKey, isOver } from "./_album.js";

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
    // After the event, co-hosts get the simple Album instead of the host
    // tools (_over). _album_key is the private album link for that event.
    const out = await Promise.all((events || []).map(async (e) => {
      let last = null;
      try {
        const { data: p } = await supabase.from("photos").select("created_at").eq("event_id", e.id).order("created_at", { ascending: false }).limit(1);
        last = p && p[0] ? p[0].created_at : null;
      } catch {}
      let key = null;
      try { key = albumKey(e.id); } catch {}
      return { ...e, _cohost: true, _over: !!key && isOver(e, last), _album_key: key };
    }));
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: out }) };
  } catch {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: [] }) }; // table not created yet
  }
}
