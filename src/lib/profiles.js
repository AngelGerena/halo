// Client-account helpers for the HALO super-admin view.
//
// Phase 1 of the Accounts build (see docs/accounts-phase1-spec.md) adds a
// `profiles` table (id, email, full_name, is_admin, created_at, …) and an
// `owner_id` column on `events`. These helpers let the admin dashboard:
//   - resolve each event's owner_id to a readable name/email, and
//   - list every client (profiles) with a per-client event count.
//
// Admins can read all profiles via the "profiles admin read" RLS policy once
// the admin is authenticated (Supabase session). During the passcode-only
// transition the anon client still returns rows that the open/transitional
// policies expose; on integration with src/lib/auth.jsx the same calls run
// under the admin's session and RLS scopes them correctly. These helpers fail
// soft: if the profiles table or columns aren't live yet, they return empty
// data so the dashboard keeps working instead of throwing.

import { supabase } from "./supabase.js";

// Resolve a set of owner_ids to a map { id: { id, email, full_name } }.
// Pass the owner_ids pulled off the events list; nulls/dupes are ignored.
export async function fetchOwnerProfiles(ownerIds) {
  const ids = Array.from(new Set((ownerIds || []).filter(Boolean)));
  if (ids.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", ids);
    if (error) throw error;
    return Object.fromEntries((data || []).map((p) => [p.id, p]));
  } catch {
    // Table/columns may not exist yet (pre-migration) — fail soft.
    return {};
  }
}

// List every client profile. Returns [] if the table isn't live yet.
export async function fetchAllProfiles() {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, is_admin, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch {
    return [];
  }
}

// Count events per owner_id across the already-loaded events list.
// Returns a map { owner_id: count }. Unassigned events are not counted.
export function eventCountsByOwner(events) {
  const map = {};
  for (const e of events || []) {
    if (e && e.owner_id) map[e.owner_id] = (map[e.owner_id] || 0) + 1;
  }
  return map;
}

// A readable label for an event's owner, given the resolved profile map.
// "Jane Doe (jane@example.com)", "jane@example.com", or null when unassigned.
export function ownerLabel(ownerId, profileMap) {
  if (!ownerId) return null;
  const p = (profileMap || {})[ownerId];
  if (!p) return null;
  const name = (p.full_name || "").trim();
  const email = (p.email || "").trim();
  if (name && email) return `${name} (${email})`;
  return name || email || null;
}
