import { safeSlug, decodeSlug } from './routeSafety.mjs';
const decodeXml = value => value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Only public content routes; never snapshot customer, admin or checkout state. */
export function routeOutputPath(route) {
  if (route === '/') return 'index.html';
  const parts = route.split('/');
  if (parts.length !== 3 || !['books', 'page', 'collections'].includes(parts[1])) throw new Error(`Unsupported snapshot route: ${route}`);
  const slug = decodeSlug(parts[2]);
  if (!safeSlug(slug)) throw new Error(`Unsafe snapshot route: ${route}`);
  // `<route>.html`, not `<route>/index.html`: GitHub Pages serves /books/x from books/x.html with 200,
  // whereas a folder makes it 301-redirect to /books/x/ — a URL that no longer matches the slash-less
  // canonical, og:url, JSON-LD and sitemap entries. /books/x/ falls through to the 404.html SPA fallback.
  return `${parts[1]}/${slug}.html`;
}

/**
 * The public routes to snapshot. A route whose slug cannot be a file name (free-text book slug such as
 * `Moon: Vol 2`) is skipped with a warning and reported to `onSkip`; it must never abort the deploy.
 */
export function publicRoutes(xml, siteUrl, onSkip = route => console.warn(`::warning::Skipped unsafe public route (not prerendered): ${route}`)) {
  const base = new URL(siteUrl.replace(/\/$/, '') + '/');
  return [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap(match => {
    const url = new URL(decodeXml(match[1]));
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) return [];
    const route = '/' + url.pathname.slice(base.pathname.length).replace(/\/$/, '');
    if (route !== '/' && !/^\/(books|page|collections)\/[^/]+$/.test(route)) return [];
    try { routeOutputPath(route); } catch { onSkip(route); return []; }
    return [route];
  }))];
}

/** Runs inside the rendering browser. Serialize DOM only, never storage/window state. */
export function captureDocument({ template, publicUrl, localOrigin }) {
  const root = document.getElementById('root');
  if (!root?.textContent?.trim() || document.querySelector('vite-error-overlay')) throw new Error('Cannot snapshot an empty or failed storefront');
  const pageSlug = new URL(publicUrl).pathname.split('/page/')[1];
  if (pageSlug && document.querySelector('[data-seo-page]')?.getAttribute('data-seo-page') !== decodeURIComponent(pageSlug)) throw new Error('Cannot snapshot an unfinished custom page');
  const collectionSlug = new URL(publicUrl).pathname.split('/collections/')[1];
  if (collectionSlug && document.querySelector('[data-seo-collection]')?.getAttribute('data-seo-collection') !== decodeURIComponent(collectionSlug)) throw new Error('Cannot snapshot an unfinished collection');
  const clone = document.documentElement.cloneNode(true);
  const original = new DOMParser().parseFromString(template, 'text/html');
  // Runtime scripts are not data. Reuse only scripts shipped in the app shell, and
  // the current page's JSON-LD; avoid duplicating third-party script side effects.
  clone.querySelectorAll('script').forEach(script => {
    if (script.id !== 'seo-jsonld-page' || script.type !== 'application/ld+json') script.remove();
  });
  original.querySelectorAll('script:not([type="application/ld+json"])').forEach(script => {
    clone.querySelector('body').appendChild(script.cloneNode(true));
  });
  clone.querySelectorAll('*').forEach(element => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
      else if (attribute.value.includes(localOrigin)) {
        // Code and styles the app asked for while rendering stay on whatever address serves the page. Pinned to the
        // shop's own domain, the default Firebase address (which only redirects there) would load them cross-origin
        // and the browser would block the lazy chunks (no CORS header).
        const fetched = (element.localName === 'link' && /modulepreload|preload|stylesheet/.test(element.getAttribute('rel') || '') && attribute.name === 'href')
          || (element.localName === 'script' && attribute.name === 'src');
        element.setAttribute(attribute.name, attribute.value.replaceAll(localOrigin, fetched ? '' : new URL(publicUrl).origin));
      }
    }
  });
  // Google Fonts stylesheets must not hold up the first paint of the snapshot (each is a round trip to
  // fonts.googleapis.com before anything shows). They are fetched at once and applied when they arrive;
  // display=swap already shows the text in the fallback font until then. Duplicates are dropped.
  const fontLinks = new Map();
  clone.querySelectorAll('link[href^="https://fonts.googleapis.com/"]').forEach(link => {
    if (!/stylesheet|preload/.test(link.getAttribute('rel') || '')) return;
    const href = link.getAttribute('href');
    const kept = fontLinks.get(href);
    if (kept) {
      if (link.id && !kept.id) kept.id = link.id;
      link.remove();
      return;
    }
    fontLinks.set(href, link);
    link.setAttribute('rel', 'preload');
    link.setAttribute('as', 'style');
    link.setAttribute('onload', "this.onload=null;this.rel='stylesheet'");
  });
  // Book photos fade in once loaded (MainSite SkeletonImage). The saved page must show them straight away
  // rather than as the grey placeholder it had while the snapshot was taken.
  clone.querySelectorAll('[data-fm-skeleton]').forEach(element => element.remove());
  clone.querySelectorAll('img[data-fm-fade]').forEach(img => {
    img.classList.remove('opacity-0');
    img.classList.add('opacity-100');
  });
  // The book page's thumbnail strip sizes its thumbnails from the width it measured in this browser (ThumbStrip:
  // data-fill, --thumb-cols, --thumb-h). Saved, that would give a phone the build's row of 5 tall slivers until
  // the app re-measured (3 a row there), moving everything under the photo. The saved page keeps the strip's own
  // CSS layout instead (productPageStyle.ts), which the app's first render draws too before it measures.
  clone.querySelectorAll('.fm-pdp-rail[data-fill]').forEach(rail => {
    rail.removeAttribute('data-fill');
    rail.removeAttribute('data-last-row');
    rail.style.removeProperty('--thumb-cols');
    rail.style.removeProperty('--thumb-h');
    if (!rail.getAttribute('style')?.trim()) rail.removeAttribute('style');
  });
  let canonical = clone.querySelector('link[rel="canonical"]');
  if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; clone.querySelector('head').appendChild(canonical); }
  canonical.setAttribute('href', publicUrl);
  const og = clone.querySelector('meta[property="og:url"]');
  if (og) og.setAttribute('content', publicUrl);
  clone.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    script.textContent = script.textContent.replaceAll(localOrigin, new URL(publicUrl).origin).replace(/</g, '\\u003c');
  });
  return '<!DOCTYPE html>\n' + clone.outerHTML;
}
