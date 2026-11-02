#!/usr/bin/env node
// Phone fit check: every screen of the stockroom, drawn at phone width in a
// real browser, must not scroll sideways, and the bottom bar buttons must be
// big enough to tap. Same dev server and fake cloud as the fair-day check.
//
//   npm run e2e:phone
//   CHROME_PATH=/path/to/chrome npm run e2e:phone
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIN_TAP = 44;
const chromePath = process.env.CHROME_PATH
  || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => fs.existsSync(p));

const server = await createServer({
  configFile: path.join(ROOT, 'scripts/phone-shots/vite.shots.config.js'),
  server: { port: 5298, strictPort: false },
});
await server.listen();
const base = new URL('/', server.resolvedUrls?.local?.[0]).href;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : {});
let failed = false;
const pageErrors = [];
const check = (ok, what, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failed = true;
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.route('**/*', (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await page.goto(base);
  await page.waitForFunction(() => window.__shotsReady === true, null, { timeout: 30000 });

  const tabs = await page.evaluate(() => [...document.querySelectorAll('.tab-panel[id^="tab-"]')].map(el => el.id.slice(4)));
  console.log(`\n▸ ${tabs.length} screens at 390 pixels wide`);
  for (const tab of tabs) {
    await page.evaluate((t) => { try { window.switchTab(t); } catch (e) { /* a screen may need setup */ } }, tab);
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    check(m.scroll <= m.width + 1, `${tab}: does not scroll sideways`, `${m.scroll}px of content in ${m.width}px`);
  }

  console.log('\n▸ Bottom bar (on Home)');
  await page.evaluate(() => window.switchTab('today'));
  await page.waitForTimeout(200);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#mnav .mnav-btn')].map(b => {
    const r = b.getBoundingClientRect();
    return { label: b.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height) };
  }).filter(b => b.w > 0 || b.h > 0)); // the publisher layout hides Home and More on purpose
  check(sizes.length >= 2, `the bar shows ${sizes.length} buttons`);
  for (const s of sizes) check(s.w >= MIN_TAP && s.h >= MIN_TAP, `${s.label.replace(/\n/g, ' ')}: ${s.w} by ${s.h} pixels`);

  check(pageErrors.length === 0, 'no page errors', pageErrors.join(' | '));
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
