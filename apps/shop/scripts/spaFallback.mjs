// public/404.html (GitHub Pages SPA fallback) keeps the first N path segments as the site's folder.
// N must match the build's base: 1 for /LyricalmyricalWebsite/, 0 for a custom domain at /.
// The Vite build writes it (vite.config.ts `spaFallbackBase`) so it can never disagree with the base.
const SEGMENTS = /var pathSegmentsToKeep = \d+;[^\n]*/;

export const baseSegments = base => String(base || '/').split('/').filter(Boolean).length;

export function withBaseSegments(html, base) {
  if (!SEGMENTS.test(html)) throw new Error('404.html has no "var pathSegmentsToKeep = N;" line to set');
  const n = baseSegments(base);
  return html.replace(SEGMENTS, `var pathSegmentsToKeep = ${n}; // set by the build from the site base (${base || '/'})`);
}

// How a host answers URLs that have no file of their own (vite.config.ts `spaFallbackBase`, SPA_FALLBACK env):
//  - "shell" (default, Firebase Hosting): 404.html is the app shell itself, so unknown URLs keep a real 404 status
//    and still render the editable missing-page content. firebase.json rewrites app routes to spa.html.
//  - "redirect" (the old GitHub Pages build, kept until the cleanup step): 404.html bounces to /?/<path> and
//    index.html restores the path.
export function fallbackMode(value) {
  if (value === undefined || value === '' || value === 'shell') return 'shell';
  if (value === 'redirect') return 'redirect';
  throw new Error(`SPA_FALLBACK must be "redirect" or "shell", not "${value}"`);
}

/**
 * Files written next to the built index.html while it is still the clean app shell (before the prerender
 * replaces it with the home page snapshot). `spa.html` is always that shell: Firebase Hosting serves it for
 * app routes that have no prerendered page (account, checkout, admin, books published since the last build).
 */
export function fallbackFiles({ indexHtml, page404, base, mode }) {
  const files = { 'spa.html': indexHtml };
  if (fallbackMode(mode) === 'shell') files['404.html'] = indexHtml;
  else if (page404 != null) files['404.html'] = withBaseSegments(page404, base);
  return files;
}
