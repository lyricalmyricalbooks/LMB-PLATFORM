// The canonical form of a shop URL. On its own (re-exported by bookSeo.ts) so every page's <head> code
// (seo.ts) can use it without loading the book structured-data builders into the first download.
export function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.search = '';
  url.hash = '';
  // Content routes are published slash-less (`books/<slug>.html`, sitemap, JSON-LD); a visitor who
  // arrived on `/books/<slug>/` must still name the same canonical URL.
  url.pathname = url.pathname.replace(/(\/(?:books|page|collections)\/[^/]+)\/+$/, '$1');
  return url.href;
}
