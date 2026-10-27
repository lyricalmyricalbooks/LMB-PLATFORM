import { createRequire } from 'node:module';
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
const folder = (url: string) => new URL(url).pathname.replace(/\/+$/, '') + '/';
const address = read('public/shop-profile.js').match(/"siteUrl": "(https:\/\/[^"]+)"/)![1];

describe('one site address everywhere', () => {
  const viteBase = read('vite.config.ts').match(/SITE_BASE \?\? '([^']+)'/)?.[1];
  // Every build script reads the address from the shop profile (scripts/shopProfile.mjs; SITE_URL still wins), and
  // none has an address of its own (plan 1.15).
  const profileReaders = {
    'scripts/generate-sitemap.mjs': 'await shopSiteUrl()',
    'scripts/prerender-storefront.mjs': 'await shopSiteUrl()',
    'scripts/check-published-change.mjs': 'await shopSiteUrl()',
    'scripts/carry-previous-assets.mjs': 'await shopSiteUrl()',
    'scripts/build-pages-redirect.mjs': 'await shopSiteUrl()',
    'scripts/seo-url-check.mjs': 'await shopSiteUrl()',
    'vite.config.ts': 'shopSiteUrlSync()',
  };

  it('the shop profile\'s address is at the root of its host, like the Vite base', () => {
    expect(viteBase).toBe('/');
    expect(folder(address)).toBe(viteBase);
  });

  it('the build scripts read the address from the profile and write none of their own', () => {
    for (const [file, call] of Object.entries(profileReaders)) {
      const source = read(file);
      expect(source, file).toContain(call);
      expect(source, file).not.toMatch(/SITE_URL \|\| ["']https:/);
      expect(source.replace(/^\s*\/\/.*$/gm, ''), file).not.toContain('lmb-test-shop');
    }
  });

  it('the deploy workflows build for that address when no SITE_URL variable is set', () => {
    expect(read('.github/workflows/deploy-pages.yml')).toContain('url="${CUSTOM_SITE_URL:-$(node scripts/shopProfile.mjs siteUrl)}"');
    // deploy-firebase.yml gives the email links the same address, read the way the Cloud Functions read it.
    const firebase = read('.github/workflows/deploy-firebase.yml');
    expect(firebase).toContain('url="$(node scripts/shopProfile.mjs siteUrl)"');
    expect(firebase).toContain('functions/shopConfig.js');
  });

  it('the app shell links to that address', () => {
    const shell = read('index.html');
    expect(shell).toContain(`<meta property="og:url" content="${address}/" />`);
    expect(shell).toContain(`"url": "${address}/"`);
  });

  it('the Cloud Functions link emails to that address and accept browser calls from it (and, for open tabs, from the old address)', () => {
    const { readShopConfig } = createRequire(import.meta.url)('../functions/shopConfig.js');
    const { allowedOrigins, siteUrl } = readShopConfig({});
    expect(siteUrl).toBe(address);
    expect(allowedOrigins).toContain(new URL(address).origin);
    expect(allowedOrigins).toContain('https://yourpress.github.io');
  });

  it('the Cloud Functions run where the pages call them: the profile\'s region, written into their settings at deploy', () => {
    const { readShopConfig, functionLink } = createRequire(import.meta.url)('../functions/shopConfig.js');
    const region = read('public/shop-profile.js').match(/"functionsRegion": "([^"]+)"/)![1];
    expect(readShopConfig({}).region).toBe(region);
    const moved = readShopConfig({ SHOP_FUNCTIONS_REGION: 'northamerica-northeast1', GCLOUD_PROJECT: 'press-two-shop' });
    // Same form as the pages' own calls (src/app/lib/functionsBase.ts functionUrl).
    expect(functionLink(moved, 'stripeWebhook')).toBe('https://northamerica-northeast1-press-two-shop.cloudfunctions.net/stripeWebhook');
    expect(read('src/app/lib/functionsBase.ts')).toContain('return `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;');
    expect(read('.github/workflows/deploy-firebase.yml')).toContain('region="$(node scripts/shopProfile.mjs functionsRegion)"');
    expect(read('.github/workflows/deploy-firebase.yml')).toContain("printf 'SHOP_FUNCTIONS_REGION=%s\\n' \"$region\"");
  });
});
