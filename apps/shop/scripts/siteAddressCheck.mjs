// Checks the shop's address before a deploy uses it (deploy-pages.yml build-hosting, deploy-firebase.yml email links).
// A wrong SITE_URL is expensive: the storefront's canonical-host script would send every visitor (and everyone
// forwarded from the old address) there, and emails would link there. So the address must be an https host with no
// folder, never GitHub Pages (it only forwards now), allowed by the Cloud Functions (ALLOWED_ORIGINS, or checkout fails
// CORS) and, for any address other than the default, already serving the shop (its published-content marker).
import { readFile, appendFile } from 'node:fs/promises';
import { isFingerprint } from './assetManifest.mjs';

/** The browser origins the Cloud Functions accept (functions/index.js ALLOWED_ORIGINS). */
export function allowedOriginsFrom(functionsSource) {
  const start = functionsSource.indexOf('const ALLOWED_ORIGINS');
  if (start < 0) return [];
  const block = functionsSource.slice(start, functionsSource.indexOf('];', start));
  return [...block.matchAll(/"(https?:\/\/[^"]+)"/g)].map(m => m[1]);
}

/** The email-link default (functions/index.js SITE_URL). */
export function defaultSiteUrl(functionsSource) {
  return functionsSource.match(/SITE_URL \|\| "(https:\/\/[^"]+)"/)?.[1]?.replace(/\/+$/, '') ?? '';
}

/** Why `url` can't be the shop's address, or null. */
export function siteAddressProblem(url, allowedOrigins) {
  const value = String(url || '').replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+$/.test(value)) return `SITE_URL must be the shop's https address in lower case with no folder (e.g. https://www.example.com), not "${url}".`;
  const { hostname, origin } = new URL(value);
  if (/(^|\.)github\.io$/.test(hostname)) return 'SITE_URL points at GitHub Pages, which now only forwards to the shop.';
  if (!allowedOrigins.includes(origin)) return `${origin} isn't in ALLOWED_ORIGINS (functions/index.js), so checkout there would fail. Add it and deploy the Cloud Functions first.`;
  return null;
}

// CLI: node scripts/siteAddressCheck.mjs <url> [--live] [--github-output]
//   --live: the address must already serve the shop (seo-published-fingerprint.txt is a SHA-256 digest).
if (import.meta.url === `file://${process.argv[1]}`) {
  const [url, ...flags] = process.argv.slice(2);
  const source = await readFile(new URL('../functions/index.js', import.meta.url), 'utf8');
  const fail = message => { console.log(`::error::${message}`); process.exit(1); };
  const problem = siteAddressProblem(url, allowedOriginsFrom(source));
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
