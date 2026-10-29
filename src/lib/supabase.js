import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Auth session persistence: keep the user signed in across reloads, refresh the
// access token automatically, and read the recovery session out of the URL hash
// (used by the password-reset confirm flow).
export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Photo/audio files now live in Cloudflare R2 (served from its public bucket URL).
// Supabase remains the database only. VITE_R2_PUBLIC_URL is the public read base,
// e.g. https://pub-xxxx.r2.dev (no trailing slash needed).
const R2_PUBLIC = (import.meta.env.VITE_R2_PUBLIC_URL || "").replace(/\/+$/, "");

// Full URLs we trust when a stored value is already absolute: our own R2
// bucket, and legacy rows that still point at this project's Supabase Storage.
// Any other absolute URL (someone else's image host) is refused, so a crafted
// row can never put an outside picture on a guest page or the TV.
const SUPABASE_STORAGE = url ? `${String(url).replace(/\/+$/, "")}/storage/v1/` : "";
function trustedAbsolute(p) {
  return (R2_PUBLIC && p.startsWith(`${R2_PUBLIC}/`)) || (SUPABASE_STORAGE && p.startsWith(SUPABASE_STORAGE));
}

// Public URL for a stored object key in R2.
// Back-compat: a stored full URL from our R2 bucket or legacy Supabase Storage
// is returned unchanged so old events keep working.
export function publicUrl(path) {
  if (!path) return null;
  const p = String(path);
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return /^https?:\/\//i.test(p) && trustedAbsolute(p) ? p : null;
  return `${R2_PUBLIC}/${p.replace(/^\/+/, "")}`;
}
