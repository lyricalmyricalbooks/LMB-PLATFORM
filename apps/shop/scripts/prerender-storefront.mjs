#!/usr/bin/env node
// Render the public sitemap with the same app used by shoppers. Nothing is
// bot-specific: every visitor gets the same initial HTML and live React app.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicRoutes, routeOutputPath, captureDocument } from './prerenderHtml.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const siteUrl = (process.env.SITE_URL || 'https://lmb-test-shop.web.app').replace(/\/$/, '');
const base = (process.env.SITE_BASE ?? new URL(siteUrl).pathname).replace(/\/+$/, '');
const template = await readFile(resolve(dist, 'index.html'), 'utf8');
const routes = publicRoutes(await readFile(resolve(dist, 'prerender-routes.xml'), 'utf8'), siteUrl);
if (!routes.includes('/')) throw new Error('Public sitemap must include the home page');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
// Always serve the pristine shell during capture. Write snapshots only after all
// pages succeed, so no later page can accidentally inherit another page's DOM.
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (!pathname.startsWith(base + '/')) { response.writeHead(404).end(); return; }
    const relative = decodeURIComponent(pathname.slice(base.length + 1));
    const target = resolve(dist, relative);
    if (target !== dist && !target.startsWith(dist + sep)) { response.writeHead(400).end(); return; }
    if (routes.includes('/' + relative.replace(/\/$/, '')) || !extname(relative)) { response.setHeader('Content-Type', 'text/html'); response.end(template); return; }
    response.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localOrigin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const captures = [];
  let publishedCache;
  // One copy of each shop picture/video per build: every page gets a fresh context (no shared browser cache),
  // and scrolling each page loads its photos again. Storage files never change at a given address, so
  // later pages are answered from memory with the same bytes. Saves most of the Storage download per build.
  const storageFiles = new Map();
  const fromStorage = async route => {
    const request = route.request();
    if (request.method() !== 'GET') return route.continue();
    const url = request.url();
    let file = storageFiles.get(url);
    if (!file) {
      file = route.fetch().then(async response => {
        const headers = { ...response.headers() };
        delete headers['content-encoding']; // the body comes back decoded
        delete headers['content-length'];
        return { status: response.status(), headers, body: await response.body() };
      });
      storageFiles.set(url, file);
    }
    try {
      const answer = await file;
      if (answer.status !== 200) storageFiles.delete(url);
      return route.fulfill(answer);
    } catch {
      storageFiles.delete(url);
      return route.continue();
    }
  };
  for (const route of routes) {
    // A fresh context prevents cart, wishlist, recent-book and cookie state from
    // one page contaminating another snapshot. No authentication is performed.
    const context = await browser.newContext({ locale: 'en-CA', reducedMotion: 'reduce' });
    try {
      // Public rendering must never inflate store analytics or mutate Firestore.
      await context.route(/google\.firestore\.v1\.Firestore\/Write\//, request => request.abort());
      // Storefront Firestore Lite writes go over REST (documents:commit / beginTransaction).
      await context.route(/firestore\.googleapis\.com\/v1\/.*documents:(commit|beginTransaction)/, request => request.abort());
      await context.route(/google-analytics\.com|googletagmanager\.com/, request => request.abort());
      await context.route(/^https:\/\/(firebasestorage|storage)\.googleapis\.com\//, fromStorage);
      await context.addInitScript(cache => {
        localStorage.setItem('lm:cookie-consent', JSON.stringify({ necessary: true, analytics: false, marketing: false, decidedAt: new Date().toISOString() }));
        sessionStorage.setItem(`fm_visit_${new Date().toISOString().split('T')[0]}`, 'true');
        // Keep the Studio pop-up section group out of the HTML snapshots (PopupSections, POPUP_SUPPRESS_KEY).
        sessionStorage.setItem('lm:popup-suppressed', '1');
        // Snapshots show prices in the shop's own currency, never the build runner's country (visitorCurrency.ts).
        localStorage.setItem('fm_currency', 'CAD');
        if (cache) sessionStorage.setItem('site-bootstrap-v1', cache);
      }, publishedCache);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(localOrigin + base + route, { waitUntil: 'domcontentloaded' });
      // This cache is written only after all published catalog/settings/pages
      // reads succeed. Never publish a fallback caused by a backend outage.
      await page.waitForFunction(() => !!sessionStorage.getItem('site-bootstrap-v1'), undefined, { timeout: 60000 });
      if (!publishedCache) publishedCache = await page.evaluate(() => sessionStorage.getItem('site-bootstrap-v1'));
      if (route.startsWith('/books/')) {
        await page.waitForFunction(() => !!document.querySelector('[data-studio-label="Product page"][data-seo-reviews="ready"]') && !!document.getElementById('seo-jsonld-page'), undefined, { timeout: 30000 });
      } else if (route.startsWith('/page/')) {
        await page.waitForFunction(slug => document.querySelector('[data-seo-page]')?.getAttribute('data-seo-page') === slug, decodeURIComponent(route.slice('/page/'.length)), { timeout: 30000 });
      } else if (route.startsWith('/collections/')) {
        await page.waitForFunction(slug => document.querySelector('[data-seo-collection]')?.getAttribute('data-seo-collection') === slug, decodeURIComponent(route.slice('/collections/'.length)), { timeout: 30000 });
      } else {
        await page.locator('[data-fm-store]').first().waitFor();
      }
      // Finish React effects, lazy sections and motion before serializing DOM.
      await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
      await page.evaluate(async () => {
        const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        // Reveal real below-the-fold content before freezing its entrance
        // animation state. Otherwise no-JavaScript readers see opacity:0 rows.
        for (let y = 0; y < document.body.scrollHeight; y += Math.max(200, innerHeight - 150)) {
          scrollTo(0, y);
          await frames();
        }
        scrollTo(0, 0);
        await frames();
        const finite = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime));
        await Promise.race([
          Promise.all(finite.map(animation => animation.finished.catch(() => {}))),
          new Promise(resolve => setTimeout(resolve, 2000)),
        ]);
        await frames();
      });
      if (errors.length) throw new Error(`Render failed for ${route}: ${errors.join('; ')}`);
      const publicUrl = siteUrl + route;
      captures.push({ file: routeOutputPath(route), html: await page.evaluate(captureDocument, { template, publicUrl, localOrigin }) });
      console.log(`Rendered public HTML: ${route}`);
    } finally { await context.close(); }
  }
  for (const capture of captures) {
    const file = resolve(dist, capture.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, capture.html);
  }
  console.log(`Wrote ${captures.length} public HTML pages; customer/admin/payment pages excluded.`);
  console.log(`Downloaded ${storageFiles.size} shop pictures once for all pages.`);
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
