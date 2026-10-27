// Checks the shop's address before a deploy uses it (deploy-pages.yml build-hosting, deploy-firebase.yml email links).
// A wrong SITE_URL is expensive: the storefront's canonical-host script would send every visitor (and everyone
// forwarded from the old address) there, and emails would link there. So the address must be an https host with no
// folder, never GitHub Pages (it only forwards now), allowed by the Cloud Functions (functions/shopConfig.js, or checkout fails
// CORS) and, for any address other than the default, already serving the shop (its published-content marker).
import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isFingerprint } from './assetManifest.mjs';

const { readShopConfig } = createRequire(import.meta.url)('../functions/shopConfig.js');

/** The browser origins the Cloud Functions accept with this env (functions/shopConfig.js allowedOrigins). */
export function allowedOriginsFrom(env = process.env) {
  return [...readShopConfig(env).allowedOrigins];
}

/** The email-link address with this env (functions/shopConfig.js siteUrl). */
export function defaultSiteUrl(env = process.env) {
  return readShopConfig(env).siteUrl;
}

/** Why `url` can't be the shop's address, or null. */
export function siteAddressProblem(url, allowedOrigins) {
  const value = String(url || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(value)) return `SITE_URL must be the shop's https address in lower case with no folder (e.g. https://www.example.com), not "${url}".`;
  const { hostname, origin } = new URL(value);
  if (/(^|\.)github\.io$/.test(hostname)) return 'SITE_URL points at GitHub Pages, which now only forwards to the shop.';
  if (!allowedOrigins.includes(origin)) return `${origin} isn't allowed by the Cloud Functions (functions/shopConfig.js), so checkout there would fail. Add it to SHOP_EXTRA_ORIGINS and deploy the Cloud Functions first.`;
  return null;
}

// CLI: node scripts/siteAddressCheck.mjs <url> [--live] [--github-output]
//   --live: the address must already serve the shop (seo-published-fingerprint.txt is a SHA-256 digest).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, ...flags] = process.argv.slice(2);
  const fail = message => { console.log(`::error::${message}`); process.exit(1); };
  const problem = siteAddressProblem(url, allowedOriginsFrom(process.env));
  if (problem) fail(problem);
  const clean = url.replace(/\/+$/, '');
  if (flags.includes('--live')) {
    let marker = '';
    try {
      const response = await fetch(`${clean}/seo-published-fingerprint.txt?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
      if (response.ok) marker = (await response.text()).trim();
    } catch { /* unreachable */ }
    if (!isFingerprint(marker)) fail(`${clean} isn't serving the shop yet. Connect it in Firebase console › Hosting and wait until it opens the shop, then deploy again.`);
  }
  if (flags.includes('--github-output') && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `url=${clean}\n`);
  console.log(`Shop address OK: ${clean}`);
}
