// HALO — share a link the friendliest way the device allows.
// Phones open the native share sheet (Messages, WhatsApp, AirDrop...);
// desktops copy the link. Resolves "shared" | "copied" | "cancelled" | "failed".

export async function shareLink({ url, title, text }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return "shared";
    } catch (e) {
      if (e && e.name === "AbortError") return "cancelled";
      // Some browsers expose share() but refuse it (desktop, iframes): fall back to copy.
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

export async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* fall through to the old way */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

export function galleryUrlFor(code) {
  return `${window.location.origin}/gallery/${encodeURIComponent(code)}`;
}
