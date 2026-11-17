// The canonical form of a shop URL. On its own (re-exported by bookSeo.ts) so every page's <head> code
// (seo.ts) can use it without loading the book structured-data builders into the first download.
import { shopProfile } from '../../lib/shopProfile';

/**
 * The shop's own address (its profile's `siteUrl`, the main address), where every canonical, og:url and structured
 * data link points, whichever of the shop's addresses the page was opened on. The page's own origin only when the
 * profile has none.
 */
export function shopOrigin(site: string | undefined = shopProfile.siteUrl): string {
  if (site && /^https:\/\/[^/\s]+$/.test(site)) return site;
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** The canonical form of `value`; with `origin`, moved onto that address (same path). */
export function canonicalUrl(value: string, origin?: string): string {
  const url = new URL(value);
  if (origin) {
    const home = new URL(origin);
    url.protocol = home.protocol;
    url.host = home.host;
  }
  url.search = '';
  url.hash = '';
  // Content routes are published slash-less (`books/<slug>.html`, sitemap, JSON-LD); a visitor who
  // arrived on `/books/<slug>/` must still name the same canonical URL.
  url.pathname = url.pathname.replace(/(\/(?:books|products|page|collections)\/[^/]+)\/+$/, '$1');
  return url.href;
}
