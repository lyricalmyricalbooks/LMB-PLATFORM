import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalHostScript, moveToCanonicalHost, stampSiteAddress, DEFAULT_SITE_URL } from './canonicalHost.mjs';

const project = 'lmb-test-shop';
const at = (href: string) => {
  const url = new URL(href);
  return { hostname: url.hostname, pathname: url.pathname, search: url.search, hash: url.hash };
};

describe('one public address on Firebase Hosting', () => {
  const site = 'https://lmb-test-shop.web.app';

  it('sends the firebaseapp.com twin to the same page on SITE_URL', () => {
    expect(moveToCanonicalHost(site, project, at('https://lmb-test-shop.firebaseapp.com/books/x?a=1#top'))).toBe(`${site}/books/x?a=1#top`);
  });

  it('later sends both default hosts to the shop domain', () => {
    const domain = 'https://www.yourpress.example';
    expect(moveToCanonicalHost(domain, project, at(`${site}/track?orderId=1&key=k`))).toBe(`${domain}/track?orderId=1&key=k`);
    expect(moveToCanonicalHost(domain, project, at('https://lmb-test-shop.firebaseapp.com/'))).toBe(`${domain}/`);
  });

  it('sends the www twin to the bare domain, and the bare domain to a www SITE_URL', () => {
    const apex = 'https://yourpress.example';
    expect(moveToCanonicalHost(apex, project, at('https://www.yourpress.example/books/x?a=1#top'))).toBe(`${apex}/books/x?a=1#top`);
    expect(moveToCanonicalHost(apex, project, at(`${site}/`))).toBe(`${apex}/`);
    expect(moveToCanonicalHost('https://www.yourpress.example', project, at('https://yourpress.example/track'))).toBe('https://www.yourpress.example/track');
    expect(moveToCanonicalHost(apex, project, at(`${apex}/`))).toBeNull();
    expect(moveToCanonicalHost(apex, project, at('https://shop.yourpress.example/'))).toBeNull();
    expect(moveToCanonicalHost(apex, project, at('https://www.yourpress.example/__/auth/handler'))).toBeNull();
  });

  it('does nothing on the canonical host, GitHub Pages, localhost or the prerender server', () => {
    expect(moveToCanonicalHost(site, project, at(`${site}/admin`))).toBeNull();
    for (const href of ['https://yourpress.github.io/shop/', 'http://localhost:5173/', 'http://127.0.0.1:41234/books/x']) {
      expect(moveToCanonicalHost(site, project, at(href))).toBeNull();
    }
  });

  it('is inert while the build targets the GitHub Pages sub-path', () => {
    expect(moveToCanonicalHost('https://yourpress.github.io/shop', project, at(`${site}/`))).toBeNull();
  });

  it("leaves Firebase's reserved sign-in paths alone and survives a bad address", () => {
    expect(moveToCanonicalHost('https://shop.example', project, at(`${site}/__/auth/handler`))).toBeNull();
    expect(moveToCanonicalHost('not a url', project, at(`${site}/`))).toBeNull();
  });

  it('runs as the inline script the build writes, and calls location.replace', () => {
    const calls: string[] = [];
    const location = { ...at('https://lmb-test-shop.firebaseapp.com/page/about'), replace: (to: string) => calls.push(to) };
    vm.runInNewContext(canonicalHostScript(site), { window: { location }, URL });
    expect(calls).toEqual([`${site}/page/about`]);
  });

  it('cannot break out of its <script> tag', () => {
    expect(canonicalHostScript('https://x.web.app/</script><script>alert(1)')).not.toContain('</script>');
  });

  it("rewrites index.html's built-in address only for another valid SITE_URL", () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
    expect(html).toContain(`${DEFAULT_SITE_URL}/`);
    const stamped = stampSiteAddress(html, 'https://yourpress.example/');
    expect(stamped).not.toContain(DEFAULT_SITE_URL);
    expect(stamped).toContain('<meta property="og:url" content="https://yourpress.example/" />');
    expect(stampSiteAddress(html, DEFAULT_SITE_URL)).toBe(html);
    expect(stampSiteAddress(html, 'https://x.com/folder')).toBe(html);
    expect(stampSiteAddress(html, undefined)).toBe(html);
  });
});
