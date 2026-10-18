import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anon);

// Photo/audio files now live in Cloudflare R2 (served from its public bucket URL).
// Supabase remains the database only. VITE_R2_PUBLIC_URL is the public read base,
// e.g. https://pub-xxxx.r2.dev (no trailing slash needed).
const R2_PUBLIC = (import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/+$/, "");

// Public URL for a stored object key in R2.
// Back-compat: if a stored value is already a full URL (legacy Supabase rows),
// return it unchanged so old events keep working during/after the migration.
export function publicUrl(path) {
  if (!path) return null;
  const p = String(path);
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  return `${R2_PUBLIC}/${p.replace(/^\/+/, "")}`;
}
