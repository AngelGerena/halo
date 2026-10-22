// HALO — writes the site appearance settings (theme + swappable landing photos).
// App-global admin only. Auth: per-user session (profiles.is_admin) OR the
// transitional admin passcode. Mirrors manage-hero.js.
//
// Actions:
//   get                               -> current settings row (admin convenience)
//   set-theme   { theme }             -> change the active palette
//   set-image   { slot, storage_path } -> point a landing photo at an uploaded R2 object
//   reset-image { slot }              -> clear a photo back to the bundled default
import { createClient } from "@supabase/supabase-js";
import { deleteObjects } from "./_r2.js";
import { authenticate } from "./_auth.js";

// Must match the palettes baked into the landing page and site-config.js.
const THEMES = new Set([
  "midnight", "blush", "obsidian", "emerald", "sunset",
  "plum", "ivory", "sapphire", "rosegold", "onyx",
]);

// slot -> column name. Only these four landing photos are swappable.
const SLOTS = {
  friends: "img_friends",
  wedding: "img_wedding",
  qr: "img_qr",
  quinceanera: "img_quinceanera",
};

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { action, theme, slot, storage_path } = b;

  const auth = await authenticate(event);
  if (!auth.ok) return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  if (!auth.isAdmin) return { statusCode: 403, body: JSON.stringify({ error: "Forbidden" }) };

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Ensure the singleton row exists so every update has something to hit.
    await supabase.from("site_settings").upsert({ id: 1 }, { onConflict: "id", ignoreDuplicates: true });

    if (action === "set-theme") {
      if (!THEMES.has(theme)) throw new Error("Unknown theme");
      const { data, error } = await supabase
        .from("site_settings").update({ theme }).eq("id", 1).select().single();
      if (error) throw error;
      return ok({ settings: data });
    }

    if (action === "set-image") {
      const col = SLOTS[slot];
      if (!col) throw new Error("Unknown image slot");
      if (!storage_path) throw new Error("storage_path required");

      // Clean up the object this slot used to point at (if it was a custom one)
      // so swapped-out photos don't pile up in R2. Defaults are null, so nothing
      // to delete in that case.
      const { data: cur } = await supabase.from("site_settings").select(col).eq("id", 1).single();
      const old = cur ? cur[col] : null;

      const { data, error } = await supabase
        .from("site_settings").update({ [col]: storage_path }).eq("id", 1).select().single();
      if (error) throw error;

      if (old && old !== storage_path) {
        try { await deleteObjects([old]); } catch (e) { console.error("R2 cleanup warning:", e.message); }
      }
      return ok({ settings: data });
    }

    if (action === "reset-image") {
      const col = SLOTS[slot];
      if (!col) throw new Error("Unknown image slot");

      const { data: cur } = await supabase.from("site_settings").select(col).eq("id", 1).single();
      const old = cur ? cur[col] : null;

      const { data, error } = await supabase
        .from("site_settings").update({ [col]: null }).eq("id", 1).select().single();
      if (error) throw error;

      if (old) { try { await deleteObjects([old]); } catch (e) { console.error("R2 cleanup warning:", e.message); } }
      return ok({ settings: data });
    }

    // get (default)
    const { data, error } = await supabase
      .from("site_settings")
      .select("theme, img_friends, img_wedding, img_qr, img_quinceanera, updated_at")
      .eq("id", 1).single();
    if (error) throw error;
    return ok({ settings: data });
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}

function ok(obj) {
  return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true, ...obj }) };
}
