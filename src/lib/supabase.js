import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(url, anon);

// Public URL for a stored object in the 'halo' bucket
export function publicUrl(path) {
  return supabase.storage.from("halo").getPublicUrl(path).data.publicUrl;
}
