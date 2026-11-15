// Only http(s) links may become clickable. Blocks javascript:, data: and the
// like, which React still allows in an href.
export function safeHttpUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch { return ""; }
}
