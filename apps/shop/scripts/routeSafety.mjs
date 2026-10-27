// One rule for "can this slug become a snapshot file name?", shared by the sitemap and the prerender so a
// slug the prerender would refuse is never listed (and a free-text slug can never block a deploy).
/** True when `slug` (already decoded) can safely be a `<route>.html` file name. */
export function safeSlug(slug) {
  const value = String(slug ?? '');
  return !!value && value !== '.' && value !== '..' && !/[\\/%\x00-\x1f<>:"|?*]/.test(value) && !/[. ]$/.test(value);
}

/** Decodes a URL path segment; a malformed escape is unsafe rather than an exception. */
export function decodeSlug(segment) {
  try { return decodeURIComponent(segment); } catch { return ''; }
}
