// HALO — PUBLIC site appearance config for the marketing/landing page.
//
// No auth: the static landing page fetches this on load to learn which theme
// to apply and whether any of its photos have been swapped out. Writes happen
// elsewhere (manage-site, admin-only). This endpoint is read-only.
//
// Returns:
//   { ok:true, theme:"midnight",
//     images:{ friends:<url|null>, wedding:<url|null>, qr:<url|null>, quinceanera:<url|null> } }
// A null image means "use the bundled default that ships with the site".
import { createClient } from "@supabase/supabase-js";
import { publicUrl } from "./_r2.js";

// Keep in sync with the palettes baked into the landing page CSS. An unknown
// stored value falls back to "midnight" so a bad write can never break the page.
const THEMES = new Set([
  "midnight", "blush", "obsidian", "emerald", "sunset",
  "plum", "ivory", "sapphire", "rosegold", "onyx",
]);

const DEFAULT = {
  ok: true,
  theme: "midnight",
  images: { friends: null, wedding: null, qr: null, quinceanera: null },
};

export async function handler() {
  // Any failure returns the safe default (200) so the landing page always
  // renders — it just shows the shipped theme and bundled photos.
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("site_settings")
      .select("theme, img_friends, img_wedding, img_qr, img_quinceanera")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return json(200, DEFAULT);
    }

    const theme = THEMES.has(data.theme) ? data.theme : "midnight";
    return json(200, {
      ok: true,
      theme,
      images: {
        friends: data.img_friends ? publicUrl(data.img_friends) : null,
        wedding: data.img_wedding ? publicUrl(data.img_wedding) : null,
        qr: data.img_qr ? publicUrl(data.img_qr) : null,
        quinceanera: data.img_quinceanera ? publicUrl(data.img_quinceanera) : null,
      },
    });
  } catch {
    return json(200, DEFAULT);
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // Short cache so changes show up fast but we don't hit the DB on every
      // single page view. 60s at the edge; the admin sees changes immediately
      // because the admin panel reads the DB directly, not this endpoint.
      "Cache-Control": "public, max-age=30, s-maxage=60",
    },
    body: JSON.stringify(obj),
  };
}
