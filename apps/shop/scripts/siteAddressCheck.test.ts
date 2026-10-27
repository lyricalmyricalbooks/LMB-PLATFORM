import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { allowedOriginsFrom, defaultSiteUrl, siteAddressProblem } from './siteAddressCheck.mjs';

const functions = readFileSync(join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const allowed = allowedOriginsFrom(functions);

describe('the shop address a deploy may use', () => {
  it('reads the Cloud Functions allow-list and the email-link default', () => {
    expect(allowed).toContain('https://lmb-test-shop.web.app');
    expect(allowed).toContain('https://www.lyricalmyricalbooks.com');
    expect(siteAddressProblem(defaultSiteUrl(functions), allowed)).toBeNull();
  });

  it("accepts the shop's own domain once the Functions allow it", () => {
    expect(siteAddressProblem('https://www.lyricalmyricalbooks.com', allowed)).toBeNull();
    expect(siteAddressProblem('https://lyricalmyricalbooks.com/', allowed)).toBeNull();
  });

  it('refuses addresses that would send shoppers somewhere checkout fails', () => {
    expect(siteAddressProblem('https://lmb-test-shop.firebaseapp.com', allowed)).toMatch(/ALLOWED_ORIGINS/);
    expect(siteAddressProblem('https://www.lyricalmyricalbook.com', allowed)).toMatch(/ALLOWED_ORIGINS/);
    expect(siteAddressProblem('https://lyricalmyricalbooks.github.io', allowed)).toMatch(/GitHub Pages/);
    expect(siteAddressProblem('https://lyricalmyricalbooks.github.io/LyricalmyricalWebsite', allowed)).toMatch(/no folder/);
    for (const bad of ['', 'http://lyricalmyricalbooks.com', 'lyricalmyricalbooks.com', 'https://Shop.com', undefined]) {
      expect(siteAddressProblem(bad, allowed), String(bad)).not.toBeNull();
    }
    expect(siteAddressProblem('https://Lyricalmyricalbooks.com', allowed)).toMatch(/lower case/);
  });

  it('the deploy workflows lower-case SITE_URL before checking it (hosts are case-insensitive)', () => {
    for (const file of ['deploy-pages.yml', 'deploy-firebase.yml']) {
      const workflow = readFileSync(join(__dirname, '..', '.github', 'workflows', file), 'utf8');
      expect(workflow, file).toMatch(/CUSTOM_SITE_URL="\$\(printf '%s' "\$CUSTOM_SITE_URL" \| tr '\[:upper:\]' '\[:lower:\]'\)"/);
    }
  });
});
