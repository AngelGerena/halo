// HALO — guest (contributor) helpers shared by the guest and host pages.
import { supabase } from "./supabase.js";

// Browser reads of contributors must name their columns (id, event_id, name,
// created_at). `email` and the guest's private `secret` are refused for anon /
// signed-in reads; see supabase/privacy-guards.sql.

// A private random value that only this guest's phone keeps. It proves to
// rename-contributor that a rename really comes from this guest.
export function newSecret() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// A fresh row id made in the browser, so a retried insert reuses it.
export function newId() {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  const b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Create a guest row and read back only public columns. If the privacy SQL
// has not been run yet (no `secret` column), retry once without it so guests
// can always join.
export async function insertContributor(row) {
  let res = await supabase.from("contributors").insert(row).select("id,name").single();
  if (res.error && "secret" in row && /secret/i.test(res.error.message || "")) {
    const { secret, ...rest } = row;
    res = await supabase.from("contributors").insert(rest).select("id,name").single();
  }
  // An earlier try already saved this exact row (same id): treat as success.
  if (res.error && res.error.code === "23505" && row.id) {
    return { data: { id: row.id, name: row.name }, error: null };
  }
  return res;
}
