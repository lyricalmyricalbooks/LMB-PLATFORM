import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shop's public address is written down in several places (Vite base, build scripts, the app shell, the deploy
// workflows, the old address's forwarding pages and the Cloud Functions that put links in emails). After the
// repository rename (October 2026) they disagreed, which left the live site unstyled and email links pointing at a
// dead address. Keep every default identical. Since the move to Firebase Hosting the shop lives at the root of its
// address; the repository variable SITE_URL (its own domain, later) overrides all of them at deploy time.
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const defaultUrl = (file: string) => {
  const match = read(file).match(/SITE_URL \|\| ["'](https:\/\/[^"']+)["']/);
  if (!match) throw new Error(`No SITE_URL default in ${file}`);
  return match[1].replace(/\/+$/, '');
};
const folder = (url: string) => new URL(url).pathname.replace(/\/+$/, '') + '/';

describe('one site address everywhere', () => {
  const viteBase = read('vite.config.ts').match(/SITE_BASE \?\? '([^']+)'/)?.[1];
  const files = ['functions/index.js', 'vite.config.ts', 'scripts/generate-sitemap.mjs', 'scripts/prerender-storefront.mjs',
    'scripts/check-published-change.mjs', 'scripts/carry-previous-assets.mjs', 'scripts/build-pages-redirect.mjs'];
  const address = defaultUrl('functions/index.js');

  it('every SITE_URL default matches the Vite base', () => {
    expect(viteBase).toMatch(/^\/(?:[^/]+\/)*$/);
    for (const file of files) expect(folder(defaultUrl(file)), file).toBe(viteBase);
  });

  it('every SITE_URL default is the same address', () => {
    expect(new Set(files.map(defaultUrl)).size).toBe(1);
  });

  it('the deploy workflows build for that address when no SITE_URL variable is set', () => {
    const fallback = read('.github/workflows/deploy-pages.yml').match(/\$\{CUSTOM_SITE_URL:-(https:\/\/[^}]+)\}/)?.[1];
    expect(fallback).toBe(address);
    // deploy-firebase.yml reads the email-link default straight from functions/index.js.
    expect(read('.github/workflows/deploy-firebase.yml')).toContain('functions/index.js');
  });

  it('the app shell links to that address', () => {
    const shell = read('index.html');
    expect(shell).toContain(`<meta property="og:url" content="${address}/" />`);
    expect(shell).toContain(`"url": "${address}/"`);
  });

  it('the Cloud Functions accept browser calls from the shop (and, for open tabs, from the old address)', () => {
    const functions = read('functions/index.js');
    const start = functions.indexOf('const ALLOWED_ORIGINS');
    const allowed = functions.slice(start, functions.indexOf('];', start));
    expect(allowed).toContain(`"${new URL(address).origin}"`);
    expect(allowed).toContain('"https://lyricalmyricalbooks.github.io"');
  });
});
