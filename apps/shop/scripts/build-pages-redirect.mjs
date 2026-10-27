#!/usr/bin/env node
// Writes the old GitHub Pages site after the move to Firebase Hosting: forwarding pages only (scripts/pagesRedirect.mjs).
//   SITE_URL=https://lmb-test-shop.web.app node scripts/build-pages-redirect.mjs --routes dist/prerender-routes.xml --out pages-redirect
// index.html and 404.html cover every old address; each prerendered page also gets its own forwarding page at its
// old address, answered with 200 and a canonical link to the new page, so search engines follow the move.
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { publicRoutes, routeOutputPath } from './prerenderHtml.mjs';
import { redirectPage } from './pagesRedirect.mjs';

const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const target = (process.env.SITE_URL || 'https://lmb-test-shop.web.app').replace(/\/+$/, '');
const parsed = new URL(target);
if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || /github\.io$/.test(parsed.hostname)) {
  throw new Error(`The forwarding pages need the shop's own https address at the root of its host, not ${target}`);
}
const out = resolve(option('--out') || 'pages-redirect');
const routesFile = option('--routes');
const routes = routesFile && existsSync(routesFile) ? publicRoutes(await readFile(routesFile, 'utf8'), target, () => {}) : [];

await rm(out, { recursive: true, force: true });
const write = async (file, html) => { const path = resolve(out, file); await mkdir(dirname(path), { recursive: true }); await writeFile(path, html); };
await write('404.html', redirectPage({ target }));
await write('index.html', redirectPage({ target, newUrl: `${target}/` }));
let pages = 0;
for (const route of routes) {
  if (route === '/') continue;
  await write(routeOutputPath(route), redirectPage({ target, newUrl: target + route }));
  pages += 1;
}
console.log(`Forwarding pages for ${target}: index, 404 and ${pages} page addresses written to ${out}.`);
