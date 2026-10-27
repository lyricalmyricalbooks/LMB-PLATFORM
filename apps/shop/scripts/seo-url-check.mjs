#!/usr/bin/env node
// Search Console check for the live shop: fetches every sitemap URL and the old Big Cartel addresses and prints
// status, final URL and canonical for each. Node built-ins only; reads firebase.json for the redirect map.
//
//   node scripts/seo-url-check.mjs                       # https://lyricalmyricalbooks.com
//   node scripts/seo-url-check.mjs --base https://lmb-test-shop.web.app
//
// Fails (exit 1) when a sitemap URL isn't a 200 with a self-referencing canonical, when robots.txt doesn't point
// at the sitemap or blocks /cart (which answers noindex), when an old address takes more than one 301 hop or
// lands anywhere but a 200, or when an unknown old address is forwarded instead of answering 404/410.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const base = (option('--base') || process.env.SITE_URL || 'https://lyricalmyricalbooks.com').replace(/\/+$/, '');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const redirects = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8')).hosting.redirects || [];

const failures = [];
const rows = [];

async function get(url) {
  const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'lyricalmyrical-seo-url-check' } });
  return { status: response.status, headers: response.headers, body: response.status === 200 ? await response.text() : '' };
}

/** Follows redirects by hand so every hop is counted. */
async function trace(url) {
  const hops = [];
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await get(current);
    hops.push({ url: current, status: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) { current = new URL(location, current).href; continue; }
    return { hops, final: current, res };
  }
  return { hops, final: current, res: { status: 0, headers: new Headers(), body: '' } };
}

const attr = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
const canonicalOf = html => {
  const tag = (html.match(/<link\b[^>]*>/gi) || []).find(t => /\brel\s*=\s*["']canonical["']/i.test(t));
  return tag ? attr(tag, 'href') : '';
};
const noindexOf = (html, headers) => /noindex/i.test(headers.get('x-robots-tag') || '')
  || (html.match(/<meta\b[^>]*>/gi) || []).some(t => /name\s*=\s*["']robots["']/i.test(t) && /noindex/i.test(attr(t, 'content') || ''));
const h1Count = html => (html.match(/<h1\b/gi) || []).length;

async function checkUrl(label, path, expect) {
  const url = path.startsWith('http') ? path : base + path;
  let result;
  try { result = await trace(url); } catch (error) { failures.push(`${url}: ${error.message}`); rows.push({ label, url, status: 'ERR', final: '', canonical: '', note: error.message }); return; }
  const { hops, final, res } = result;
  const problems = [];
  const chain = hops.map(h => h.status).join('→');
  const canonical = res.status === 200 ? canonicalOf(res.body) : '';
  const noindex = res.status === 200 && noindexOf(res.body, res.headers);
  if (expect.kind === 'page') {
    if (hops.length !== 1 || res.status !== 200) problems.push(`expected 200 with no redirect, got ${chain}`);
    if (canonical !== (expect.canonical || url)) problems.push(`canonical "${canonical}" ≠ "${expect.canonical || url}"`);
    if (noindex && !expect.noindex) problems.push('page says noindex');
    if (expect.h1 && h1Count(res.body) !== 1) problems.push(`${h1Count(res.body)} <h1> in the HTML, expected 1`);
    if (expect.intro && !/data-store-region="categoryBannerText"[^>]*>\s*[^<\s]/.test(res.body)) problems.push('no intro paragraph in the HTML');
  } else if (expect.kind === 'redirect') {
    if (hops.length !== 2 || hops[0].status !== 301) problems.push(`expected one 301 hop, got ${chain}`);
    if (expect.to && final !== expect.to) problems.push(`lands on ${final}, expected ${expect.to}`);
    if (!final.startsWith('https://lyricalmyricalbooks.com/')) problems.push('target is not on https://lyricalmyricalbooks.com');
    if (res.status !== 200) problems.push(`target answers ${res.status}`);
    if (res.status === 200 && canonical !== final) problems.push(`target canonical "${canonical}" ≠ "${final}"`);
  } else if (expect.kind === 'gone') {
    if (hops.length !== 1 || ![404, 410].includes(res.status)) problems.push(`expected 404/410 with no redirect, got ${chain}`);
  } else if (expect.kind === 'noindex') {
    if (hops.length !== 1 || res.status !== 200) problems.push(`expected 200 with no redirect, got ${chain}`);
    if (!noindex) problems.push('missing noindex');
  }
  if (problems.length && !expect.reportOnly) failures.push(`${url}: ${problems.join('; ')}`);
  rows.push({ label, url, status: chain, final: final === url ? '(same)' : final, canonical: canonical || '-', note: problems.length ? (expect.reportOnly ? 'note: ' : 'FAIL: ') + problems.join('; ') : 'ok' });
}

// robots.txt and the sitemap.
const robots = await get(`${base}/robots.txt`);
console.log(`robots.txt → ${robots.status}`);
const robotsText = robots.status === 200 ? await (await fetch(`${base}/robots.txt`, { cache: 'no-store' })).text() : '';
if (!robotsText.split('\n').some(line => line.trim() === `Sitemap: ${base}/sitemap.xml`)) failures.push(`robots.txt does not point to ${base}/sitemap.xml`);
if (/^Disallow:\s*\/cart\b/m.test(robotsText)) failures.push('robots.txt still disallows /cart (Google could not see its noindex)');
console.log(robotsText.trim().split('\n').map(l => '  ' + l).join('\n'));

const sitemap = await get(`${base}/sitemap.xml`);
const locs = [...sitemap.body.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
console.log(`\nsitemap.xml → ${sitemap.status}, ${locs.length} URLs`);
if (sitemap.status !== 200 || !locs.length) failures.push('sitemap.xml missing or empty');
for (const loc of locs) {
  if (/\/product\//.test(loc)) failures.push(`${loc}: old /product/ URL in the sitemap`);
  if (!loc.startsWith(base + '/')) failures.push(`${loc}: not on ${base}`);
  const collection = /\/collections\//.test(loc);
  await checkUrl('sitemap', loc, { kind: 'page', h1: collection, intro: collection });
}

// Collection pages: sort variants must canonicalise to the clean URL.
for (const slug of ['books', 'zines', 'publications']) {
  await checkUrl('sort variant', `/collections/${slug}?sort=price-asc`, { kind: 'page', canonical: `${base}/collections/${slug}`, h1: true });
}

// Old Big Cartel addresses.
const apex = 'https://lyricalmyricalbooks.com';
for (const rule of redirects) {
  if (/[*]/.test(rule.source)) continue;
  await checkUrl('old address', rule.source, { kind: 'redirect', to: rule.destination.startsWith('http') ? rule.destination : apex + rule.destination });
}
for (const path of ['/product/bodies-ilaria-de-benedetto', '/product/as-if-nobody-is-watching-chiara-pirovano', '/product/untitled-ernesto-cabral-de-luna',
  '/product/zz-seo-check-unmapped', '/category/zz-seo-check-unmapped']) {
  await checkUrl('old, gone', path, { kind: 'gone' });
}
await checkUrl('cart', '/cart', { kind: 'noindex' });
await checkUrl('stale link', '/cdn-cgi/l/email-protection', { kind: 'gone', reportOnly: true });

console.log('');
for (const row of rows) console.log(`[${row.label}] ${row.status.padEnd(8)} ${row.url}\n    final: ${row.final}\n    canonical: ${row.canonical}\n    ${row.note}`);
console.log(`\n${rows.length} URLs checked, ${failures.length} problem(s).`);
if (failures.length) {
  for (const failure of failures) console.log(`::error::${failure}`);
  process.exit(1);
}
