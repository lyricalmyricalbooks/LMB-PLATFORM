// The shared system's publish run (LMB-PLATFORM setup/shopSite.js) builds each shop's files in a folder of its own
// (SHOP_BUILD_DIR) from that shop's profile (SHOP_PROFILE_FILE). A build script that writes to dist/ by name, or reads
// the database root, would mix one shop's files or data into another's.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('build scripts follow the publish run', () => {
  for (const name of ['generate-sitemap.mjs', 'build-storefront-data.mjs', 'prerender-storefront.mjs']) {
    it(`${name} writes only into SHOP_BUILD_DIR`, () => {
      const source = read(name);
      expect(source).toContain('SHOP_BUILD_DIR');
      expect(source).not.toMatch(/['"`]\.{0,2}\/?dist\b|\.\.\/dist/);
    });
  }
  for (const name of ['publicStorefrontData.mjs', 'build-storefront-data.mjs', 'check-published-change.mjs']) {
    it(`${name} reads the shop's own folder`, () => {
      const source = read(name);
      expect(source).toContain('shopDocumentsBase');
      expect(source).not.toMatch(/databases\/\(default\)\/documents[`'"/]/);
    });
  }
  it('the profile file and build folder come from the environment when set', async () => {
    process.env.SHOP_BUILD_DIR = '/tmp/shop-site-x';
    process.env.SHOP_PROFILE_FILE = '/tmp/shop-site-x/shop-profile.js';
    vi.resetModules();
    const mod = await import('./shopProfile.mjs');
    expect(mod.SHOP_BUILD_DIR).toBe('/tmp/shop-site-x');
    expect(mod.SHOP_PROFILE_FILE.pathname).toBe('/tmp/shop-site-x/shop-profile.js');
    delete process.env.SHOP_BUILD_DIR;
    delete process.env.SHOP_PROFILE_FILE;
  });
});
