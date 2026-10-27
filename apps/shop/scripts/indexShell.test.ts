import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The app shell (index.html) is what link previews and no-JS readers see first. It must never point at
// a site file that isn't shipped (the old og-image.jpg did): runtime useSEO sets og:image/twitter:image
// from Studio's Share image instead.
const root = join(__dirname, '..');
const shell = readFileSync(join(root, 'index.html'), 'utf8');
// The shop's address, as written in the shell (scripts/siteAddress.test.ts keeps it equal to every default).
const siteUrl = shell.match(/<meta property="og:url" content="(https:\/\/[^"]+?)\/?" \/>/)?.[1] ?? '';
const escaped = siteUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('index.html shell', () => {
  it('references only site files that exist in public/', () => {
    expect(siteUrl).toMatch(/^https:\/\//);
    const own = [...shell.matchAll(new RegExp(`${escaped}/([^"'\\s<>]+\\.[a-z0-9]+)`, 'gi'))].map(m => m[1]);
    for (const file of own) expect(existsSync(join(root, 'public', file)), file).toBe(true);
  });
  it('leaves the Search Console token to Studio (Text & labels › Site & sharing)', () => {
    // useSEO (src/app/lib/seo.ts) removes this tag whenever Studio's token is empty, so one written here never reaches
    // the prerendered pages Google reads. The token belongs in Studio, which useSEO and the prerender then emit.
    expect(shell).not.toMatch(/name="google-site-verification"/);
  });
  it('leaves the sharing image to the Studio-controlled runtime metadata', () => {
    expect(shell).not.toMatch(/property="og:image"/);
    expect(shell).not.toMatch(/name="twitter:image"/);
    expect(shell).toMatch(/name="twitter:card" content="summary"/);
  });
});
