// The admin's offline copy, for presses with both the website and the stockroom (the combined admin; registered by
// src/app/admin/adminOffline.ts, docs/combined-admin.md "Offline"). Its scope is the admin only (`/admin`), so the
// shop's own pages are never touched. The stockroom inside the admin keeps its own offline copy (/stockroom/sw.js),
// so the fair till opens with no signal once the admin has opened on the device.
//
// - The admin page: from the network when there is one (kept as the offline copy), else the last copy.
// - Built files (/assets/…, named by their contents): from the copy once fetched, else the network.
// - Plain files of the shop's own address that the admin loads (the shop profile, icons): network first, else the copy.
// Nothing else is kept: no sign-in, no shop data, no other site, nothing but GET.
const VERSION = 'lm-admin-v1';
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
/** At most this many built files are kept; the oldest go first, so old releases don't pile up. */
const MAX_ASSETS = 400;
/** How long the admin page waits for the network before opening its offline copy. */
const PAGE_WAIT_MS = 4000;

const scopePath = () => new URL(self.registration.scope).pathname;

/** What to do with a request: 'page', 'asset', 'file', or null (left alone). */
function ruleFor(request) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (request.mode === 'navigate') {
    // The admin's own address only (`/admin`, `/admin/…`), never a neighbour such as /admin-fixture.html.
    const scope = scopePath().replace(/\/$/, '');
    return url.pathname === scope || url.pathname.startsWith(`${scope}/`) ? 'page' : null;
  }
  // The stockroom's files belong to its own offline copy.
  if (url.pathname.includes('/stockroom/')) return null;
  if (/\/assets\/[^/]+$/.test(url.pathname)) return 'asset';
  if (url.pathname.endsWith('/admin-sw.js')) return null;
  // Plain files only (the shop profile, icons, the admin's manifest): never an answer from the shop's server.
  return /\.(?:js|css|png|ico|svg|webmanifest|woff2?)$/.test(url.pathname) ? 'file' : null;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

async function page(request) {
  const cache = await caches.open(PAGES);
  // One copy of the admin page, whatever its address after `#`: the app picks the page from the address itself.
  const key = new URL(scopePath(), self.location.origin).href;
  const network = fetch(request).then((response) => {
    if (response.ok) void cache.put(key, response.clone());
    return response;
  });
  network.catch(() => { /* answered from the copy below */ });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_WAIT_MS));
  try {
    const first = await Promise.race([network, timeout]);
    if (first) return first;
  } catch (_) { /* offline: the copy below */ }
  const copy = await cache.match(key);
  if (copy) return copy;
  return network;
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const copy = await cache.match(request);
  if (copy) return copy;
  const response = await fetch(request);
  if (response.ok) { await cache.put(request, response.clone()); void trim(cache); }
  return response;
}

async function file(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone());
    return response;
  } catch (error) {
    const copy = await cache.match(request, { ignoreSearch: true });
    if (copy) return copy;
    throw error;
  }
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('lm-admin-') && !name.startsWith(VERSION)) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const rule = ruleFor(event.request);
  if (rule === 'page') event.respondWith(page(event.request));
  else if (rule === 'asset') event.respondWith(asset(event.request));
  else if (rule === 'file') event.respondWith(file(event.request));
});
