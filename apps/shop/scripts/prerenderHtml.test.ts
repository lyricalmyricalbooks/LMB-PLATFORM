// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { publicRoutes, routeOutputPath, captureDocument } from './prerenderHtml.mjs';

const base = 'https://example.com/shop';
describe('public HTML snapshots', () => {
  it('limits generation to public sitemap routes in this deployment', () => {
    const xml = '<urlset>' + ['https://example.com/shop/', 'https://example.com/shop/books/a', 'https://example.com/shop/page/about', 'https://example.com/shop/collections/art', 'https://example.com/shop/account', 'https://example.com/shop/wishlist', 'https://elsewhere.com/shop/books/a'].map(u => `<url><loc>${u}</loc></url>`).join('') + '</urlset>';
    expect(publicRoutes(xml, base)).toEqual(['/', '/books/a', '/page/about', '/collections/art']);
  });
  it('rejects path traversal and encoded separators before writing files', () => {
    expect(routeOutputPath('/books/photo-book')).toBe('books/photo-book.html');
    expect(routeOutputPath('/books/a.b')).toBe('books/a.b.html');
    for (const route of ['/books/../a', '/books/%2e%2e', '/books/a%2fb', '/books/a%5cb', '/books/%252e%252e', '/admin']) {
      expect(() => routeOutputPath(route)).toThrow();
    }
  });
  it('writes slash-less route files so GitHub Pages answers the canonical URL with 200, not a redirect to a trailing slash', () => {
    expect(routeOutputPath('/')).toBe('index.html');
    for (const route of ['/books/a', '/page/about', '/collections/art']) {
      const file = routeOutputPath(route);
      expect(file).toBe(route.slice(1) + '.html');
      expect(file).not.toMatch(/\/index\.html$/);
    }
  });
  it('captures real rendered content, public URLs and metadata without browser caches or runtime scripts', () => {
    document.documentElement.innerHTML = '<head><title>Book</title><link rel="canonical" href="http://localhost/shop/"><meta property="og:url" content="http://localhost/shop/"><script type="application/ld+json" id="seo-jsonld-page">{"url":"http://localhost/shop/books/a"}</script></head><body><div id="root"><h1>Saved book title</h1><a href="/shop/books/b">Next book</a><script>privateRuntime()</script><button onclick="danger()">Bag</button></div></body>';
    sessionStorage.setItem('private-cache', 'DO-NOT-EMBED');
    const template = '<html><head></head><body><script type="module" src="/shop/assets/app.js"></script><script>window.history.replaceState(null,null,"/")</script></body></html>';
    const html = captureDocument({ template, publicUrl: base + '/books/a', localOrigin: 'http://localhost' });
    expect(html).toContain('<h1>Saved book title</h1>');
    expect(html).toContain('href="https://example.com/shop/books/a"');
    expect(html).toContain('"url":"https://example.com/shop/books/a"');
    expect(html).toContain('/shop/assets/app.js');
    expect(html).toContain('window.history.replaceState');
    expect(html).not.toContain('privateRuntime');
    expect(html).not.toContain('DO-NOT-EMBED');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('localhost');
  });
  it('rejects loading or mismatched custom pages until the expected page is ready', () => {
    document.documentElement.innerHTML = '<head></head><body><div id="root"><div data-fm-store data-studio-label="Page">Loading</div></div></body>';
    const args = { template: '<html><body></body></html>', publicUrl: base + '/page/about', localOrigin: 'http://localhost' };
    expect(() => captureDocument(args)).toThrow('unfinished custom page');
    document.querySelector('[data-fm-store]')!.setAttribute('data-seo-page', 'other');
    expect(() => captureDocument(args)).toThrow('unfinished custom page');
    document.querySelector('[data-fm-store]')!.setAttribute('data-seo-page', 'about');
    expect(captureDocument(args)).toContain('data-seo-page="about"');
  });
  it('loads Google Fonts without blocking the first paint and drops duplicate font links', () => {
    const font = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500&display=swap';
    document.documentElement.innerHTML = `<head><link rel="stylesheet" as="style" href="${font}"><link id="google-font-archivo" rel="stylesheet" href="${font}"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Mono&display=swap"><link rel="stylesheet" href="/shop/assets/index.css"></head><body><div id="root"><h1>Shop</h1></div></body>`;
    const html = captureDocument({ template: '<html></html>', publicUrl: base + '/', localOrigin: 'http://localhost' });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const fonts = [...doc.querySelectorAll('link[href^="https://fonts.googleapis.com/"]')];
    expect(fonts).toHaveLength(2);
    for (const link of fonts) {
      expect(link.getAttribute('rel')).toBe('preload');
      expect(link.getAttribute('as')).toBe('style');
      expect(link.getAttribute('onload')).toBe("this.onload=null;this.rel='stylesheet'");
    }
    expect(fonts[0].id).toBe('google-font-archivo');
    // The shop's own stylesheet still loads first, as before.
    expect(doc.querySelector('link[href="/shop/assets/index.css"]')?.getAttribute('rel')).toBe('stylesheet');
  });
  it('keeps chunk preloads on the address serving the page, so the default Firebase address does not load them cross-origin', () => {
    document.documentElement.innerHTML = '<head><link rel="modulepreload" href="http://localhost/assets/CartDrawer.js"><link rel="stylesheet" href="http://localhost/assets/a.css"><meta property="og:image" content="http://localhost/a.jpg"></head><body><div id="root"><p>A</p></div></body>';
    const doc = new DOMParser().parseFromString(captureDocument({ template: '<html></html>', publicUrl: base + '/', localOrigin: 'http://localhost' }), 'text/html');
    expect(doc.querySelector('link[rel="modulepreload"]')?.getAttribute('href')).toBe('/assets/CartDrawer.js');
    expect(doc.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('/assets/a.css');
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(new URL(base).origin + '/a.jpg');
  });
  it('shows book photos in the saved page instead of their loading placeholder', () => {
    document.documentElement.innerHTML = '<head></head><body><div id="root"><div><div data-fm-skeleton class="animate-pulse"></div><img data-fm-fade class="w-full opacity-0" src="/a.webp" alt="A"><p>A</p></div></div></body>';
    const html = captureDocument({ template: '<html></html>', publicUrl: base + '/', localOrigin: 'http://localhost' });
    expect(html).not.toContain('data-fm-skeleton');
    expect(html).toContain('class="w-full opacity-100"');
  });
  it('leaves out the thumbnail strip size measured in the build browser, so each screen lays it out itself', () => {
    document.documentElement.innerHTML = '<head></head><body><div id="root"><div class="fm-pdp-media" data-thumbs="below"><div class="fm-pdp-rail" role="group" data-fill="wrap" data-last-row="stretch" style="--thumb-cols: 5; --thumb-h: 128.64px;"><button class="fm-pdp-thumb"><img src="/a.webp" alt="A"></button></div><p>A</p></div></div></body>';
    const html = captureDocument({ template: '<html></html>', publicUrl: base + '/books/a', localOrigin: 'http://localhost' });
    const rail = new DOMParser().parseFromString(html, 'text/html').querySelector('.fm-pdp-rail')!;
    expect(rail.hasAttribute('data-fill')).toBe(false);
    expect(rail.hasAttribute('data-last-row')).toBe(false);
    expect(rail.hasAttribute('style')).toBe(false);
    expect(rail.querySelector('img')?.getAttribute('src')).toBe('/a.webp');
  });
  it('refuses empty shells and error pages instead of publishing them', () => {
    document.documentElement.innerHTML = '<head></head><body><div id="root"></div></body>';
    expect(() => captureDocument({ template: '<html></html>', publicUrl: base + '/', localOrigin: 'http://localhost' })).toThrow();
  });
});

it('rejects category snapshots until the requested collection is selected', () => {
 document.documentElement.innerHTML = '<head></head><body><div id="root"><div data-seo-collection="books">Books</div></div></body>';
 const args = { template: '<html><body></body></html>', publicUrl: base + '/collections/zines', localOrigin: 'http://localhost' };
 expect(() => captureDocument(args)).toThrow('unfinished collection');
 document.querySelector('[data-seo-collection]')!.setAttribute('data-seo-collection', 'zines');
 expect(captureDocument(args)).toContain('data-seo-collection="zines"');
});
