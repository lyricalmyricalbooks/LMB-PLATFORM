#!/usr/bin/env node
// Keep the previous deploy's hashed CSS/JS next to the new ones.
//
// GitHub Pages and Firebase Hosting both replace the whole site on every deploy. Browsers (and Pages' own 10-minute HTML cache)
// can still hold the previous HTML, which points at the previous build's `assets/<name>-<hash>.css/js`.
// Without those files the visitor sees the bare pre-rendered page with no styles and no app. So every
// deploy lists its own asset files in `asset-manifest.txt`, and the next deploy copies the files that list
// names back in. Only this build's own files go in the new list, so exactly one older generation is kept.
// Never fails the deploy: a missing list (first run) or an unreachable file is only a warning.
import { readdir, writeFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetNames, parseAssetManifest, isHtmlResponse } from './assetManifest.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = resolve(root, 'dist/assets');
const siteUrl = (process.env.SITE_URL || 'https://lmb-test-shop.web.app').replace(/\/$/, '');
const warn = message => console.warn(`::warning::${message}`);

const own = assetNames(await readdir(assetsDir));
await writeFile(resolve(root, 'dist/asset-manifest.txt'), own.join('\n') + '\n');

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  // Never save an HTML page (a host's 404 or app shell) under a script/stylesheet name or read it as the list.
  if (isHtmlResponse(response.headers.get('content-type'))) throw new Error(`HTML instead of a file at ${url}`);
  return response;
}

let previous = [];
try {
  previous = parseAssetManifest(await (await get(`${siteUrl}/asset-manifest.txt?t=${Date.now()}`)).text());
} catch (error) {
  warn(`No previous asset list (${error.message}); older cached pages may miss their styles until reloaded.`);
}
const exists = async name => access(resolve(assetsDir, name)).then(() => true, () => false);
const missing = [];
for (const name of previous) if (!(await exists(name))) missing.push(name);

let copied = 0;
for (let i = 0; i < missing.length; i += 8) {
  await Promise.all(missing.slice(i, i + 8).map(async name => {
    try {
      const body = Buffer.from(await (await get(`${siteUrl}/assets/${encodeURIComponent(name)}`)).arrayBuffer());
      await writeFile(resolve(assetsDir, name), body);
      copied += 1;
    } catch (error) { warn(`Could not keep previous asset ${name}: ${error.message}`); }
  }));
}
console.log(`Asset list: ${own.length} new files; kept ${copied} of ${missing.length} files from the previous deploy.`);
