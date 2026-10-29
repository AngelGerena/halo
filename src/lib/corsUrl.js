// iPhone Safari reuses a copy of a photo it already showed without CORS and
// then refuses to let a canvas read it (frames, highlight video, boomerang save).
// Asking for a slightly different URL keeps the CORS copy separate.
export function corsUrl(u) {
  return /^https?:/i.test(u || "") ? u + (u.includes("?") ? "&" : "?") + "cors=1" : u;
}
