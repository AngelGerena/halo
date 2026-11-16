// HALO: one-time catch-up for co-hosts invited before one-tap links existed.
//
// Their original email pointed at the sign-in page. This scheduled job emails
// each of them a fresh one-tap link, once.
//
// How "once" works with no new table or column: a row is picked up only while
// its created_at is older than CUTOFF (when one-tap links went live). Before
// emailing, the job moves that row's created_at to now, and only emails the
// rows that update actually claimed. So a second run, or two runs at the same
// moment, can never email the same person twice. created_at is otherwise only
// used to order the co-host list.
//
// The job stops doing anything a week after CUTOFF; delete this file (and its
// schedule in netlify.toml) once it has run.
import { createClient } from "@supabase/supabase-js";
import { sendCohostInvite } from "./_cohostInvite.js";

const CUTOFF = "2026-11-16T22:46:49Z";               // PR #142 merged
const STOP_AFTER = Date.parse(CUTOFF) + 7 * 864e5;

export async function handler() {
  if (Date.now() > STOP_AFTER) return { statusCode: 200, body: "retired" };
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  let sent = 0, failed = 0;
  try {
    const { data: rows, error } = await supabase.from("event_cohosts")
      .update({ created_at: new Date().toISOString() })
      .lt("created_at", CUTOFF)
      .select("id, email, event_id");
    if (error) throw error;
    for (const row of rows || []) {
      try {
        const { data: ev } = await supabase.from("events").select("name, code").eq("id", row.event_id).maybeSingle();
        if (!ev || !row.email) continue;
        // Language unknown for these, so the email carries English and Spanish.
        await sendCohostInvite({ cohostId: row.id, email: String(row.email).toLowerCase(), ev, lang: "both", fresh: true });
        sent++;
      } catch (e) {
        failed++;
        console.error("cohost-relink: send failed for co-host", row.id, e && e.message);
      }
      await new Promise((r) => setTimeout(r, 600)); // stay under Resend's 2 requests/second
    }
  } catch (e) {
    console.error("cohost-relink:", e && e.message);
    return { statusCode: 500, body: "error" };
  }
  console.log(`cohost-relink: sent ${sent}, failed ${failed}`);
  return { statusCode: 200, body: JSON.stringify({ sent, failed }) };
}
