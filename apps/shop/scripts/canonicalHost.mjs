// Firebase Hosting answers on two default addresses (<project>.web.app and <project>.firebaseapp.com) and,
// later, on the shop's own domain. Only SITE_URL may be the public address: the other hosts would be duplicate
// sites for search engines, and checkout fails on any origin the Cloud Functions don't allow (functions/shopConfig.js).
// vite.config.ts inlines this function at the top of index.html; it sends visitors on a default Firebase host,
// or on the www/bare twin of the shop's own domain, to the same page on SITE_URL. It does nothing on GitHub Pages,
// localhost or the prerender server. docs/CUSTOM_DOMAIN.md has the switch-day steps.
import { shopProjectIdSync } from './shopProfile.mjs';

/** This shop's Firebase project, from public/shop-profile.js (scripts/shopProfile.mjs). */
export const FIREBASE_PROJECT = shopProjectIdSync();
/**
 * The address index.html is written with: a fixed template value, not any one shop's address. Every build names its
 * own shop's address instead (vite.config.ts stampSiteAddress, from SITE_URL or the shop profile's siteUrl).
 */
export const DEFAULT_SITE_URL = 'https://lmb-test-shop.web.app';

/** Runs in the browser (inlined with toString), so it stays plain ES5 and self-contained. */
export function moveToCanonicalHost(target, project, here) {
  try {
    var to = new URL(target);
    if (to.pathname.replace(/\/+$/, '') !== '') return null; // only a site served from the root of its host
    if (here.hostname === to.hostname) return null;
    var defaultHost = here.hostname === project + '.web.app' || here.hostname === project + '.firebaseapp.com';
    // www.example.com <-> example.com: both can be connected to the same Hosting site; only SITE_URL's spelling is public.
    var twin = here.hostname === 'www.' + to.hostname || 'www.' + here.hostname === to.hostname;
    if (!defaultHost && !twin) return null;
    if (here.pathname.indexOf('/__/') === 0) return null; // Firebase's reserved paths (sign-in handler)
    var next = to.origin + here.pathname + here.search + here.hash;
    if (here.replace) here.replace(next);
    return next;
  } catch (e) {
    return null;
  }
}

export function canonicalHostScript(siteUrl, project = FIREBASE_PROJECT) {
  const json = value => JSON.stringify(String(value)).replace(/</g, '\\u003c');
  return `(${moveToCanonicalHost.toString()})(${json(siteUrl)}, ${json(project)}, window.location);`;
}

/** index.html names the default address (og:url, no-JS JSON-LD); a build for another SITE_URL names that one instead. */
export function stampSiteAddress(html, siteUrl) {
  const target = String(siteUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(target) || target === DEFAULT_SITE_URL) return html;
  return html.split(DEFAULT_SITE_URL + '/').join(target + '/');
}
