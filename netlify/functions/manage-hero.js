// Manages the landing hero carousel images. Service-role + passcode gated.
// Actions: add | toggle | remove | reorder | list
import { createClient } from "@supabase/supabase-js";

export async function handler(event) {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  let b = {};
  try { b = JSON.parse(event.body || "{}"); } catch {}
  const { passcode, action, storage_path, id, active, ids } = b;
  if (!passcode || passcode !== process.env.ADMIN_PASSCODE) {
    return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (action === "add") {
      if (!storage_path) throw new Error("storage_path required");
      const { data: rows } = await supabase.from("hero_images").select("sort").order("sort", { ascending: false }).limit(1);
      const nextSort = (rows && rows[0] ? rows[0].sort : 0) + 1;
      const { data, error } = await supabase.from("hero_images").insert({ storage_path, sort: nextSort, active: true }).select().single();
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true, row: data }) };
    }
    if (action === "toggle") {
      const { error } = await supabase.from("hero_images").update({ active: !!active }).eq("id", id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    if (action === "remove") {
      const { data: row } = await supabase.from("hero_images").select("storage_path").eq("id", id).single();
      if (row && row.storage_path) { await supabase.storage.from("halo").remove([row.storage_path]); }
      const { error } = await supabase.from("hero_images").delete().eq("id", id);
      if (error) throw error;
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    if (action === "reorder") {
      if (!Array.isArray(ids)) throw new Error("ids array required");
      for (let i = 0; i < ids.length; i++) {
        await supabase.from("hero_images").update({ sort: i }).eq("id", ids[i]);
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    // list
    const { data, error } = await supabase.from("hero_images").select("*").order("sort", { ascending: true });
    if (error) throw error;
    return { statusCode: 200, body: JSON.stringify({ ok: true, rows: data || [] }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
}
