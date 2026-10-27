// The storefront's catalog as one file on Firebase Hosting (October 2026).
//
// Every new visitor's browser used to read the whole published catalog, settings/website and the published pages
// from Firestore (~55 billed reads a visit). The site build now saves exactly those documents, read at one Firestore
// snapshot, as `storefront-data.json` next to the site. The browser downloads it from Hosting's CDN and reads one
// small document instead: `settings/catalogVersion`, which a Functions trigger stamps with the commit time of every
// write to a book, a page or settings/website (functions/catalogVersion.js). The file is used only when nothing was
// written after its snapshot (`readTime`), so shoppers see exactly what a Firestore read would show; otherwise the
// storefront reads Firestore as before (features/site/storefrontDataFile.ts).
//
// It also carries the public `shipping-profiles` (book pages' search listing shows a shipping figure; the bag's
// free-shipping bar and estimate use them). A write to a profile stamps the same marker
// (functions/index.js catalogVersionShipping), so a changed profile is never read from an older file.
//
// The file holds the raw document data the browser's Firestore read returns. A value type JSON can't carry the same
// way (timestamps, references, bytes, geo points, NaN) stops the file from being written, so the browser falls back.

/** Path of the file inside the built site (and on Hosting). Mirrors STOREFRONT_DATA_FILE in the browser. */
export const STOREFRONT_DATA_FILE = 'storefront-data.json';
export const STOREFRONT_DATA_VERSION = 1;

/** Firestore REST value → the plain value the Lite SDK returns. Throws on types JSON can't carry exactly. */
export function decodeStrict(value = {}, path = '') {
  if ('mapValue' in value) {
    const out = {};
    for (const [key, child] of Object.entries(value.mapValue.fields || {})) out[key] = decodeStrict(child, `${path}.${key}`);
    return out;
  }
  if ('arrayValue' in value) return (value.arrayValue.values || []).map((child, i) => decodeStrict(child, `${path}[${i}]`));
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) {
    const n = Number(value.doubleValue);
    if (!Number.isFinite(n)) throw new Error(`${path}: non-finite number`);
    return n;
  }
  throw new Error(`${path}: ${Object.keys(value)[0] || 'unknown'} values can't be stored in the file`);
}

const docId = document => document.name.split('/').at(-1);
const fieldsOf = document => decodeStrict({ mapValue: { fields: document.fields || {} } });

const publishedQuery = (collectionId, extra = {}) => ({
  from: [{ collectionId }],
  where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'published' } } },
  ...extra,
});

async function post(fetchImpl, url, body) {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Firestore read failed: ${response.status}`);
  return response.json();
}

/**
 * Reads settings/website, every published book and every published page at one Firestore snapshot and returns
 * the file's contents. `base` is `https://firestore.googleapis.com/v1/projects/<id>/databases/(default)/documents`.
 */
export async function readStorefrontData(base, project, fetchImpl = fetch, pageSize = 300) {
  const settingsName = `projects/${project}/databases/(default)/documents/settings/website`;
  const [first] = await post(fetchImpl, `${base}:batchGet`, { documents: [settingsName] });
  const readTime = first?.readTime;
  if (!readTime) throw new Error('Firestore gave no read time');
  const settings = first.found ? fieldsOf(first.found) : null;

  // Every other read happens at the same snapshot, so the file is one consistent moment of the shop.
  const books = [];
  let after = '';
  for (;;) {
    const rows = await post(fetchImpl, `${base}:runQuery`, {
      readTime,
      structuredQuery: publishedQuery('books', {
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: pageSize,
        ...(after ? { startAt: { values: [{ referenceValue: after }], before: false } } : {}),
      }),
    });
    const docs = (Array.isArray(rows) ? rows : []).filter(r => r && r.document).map(r => r.document);
    // Same shape as publicApi.getStorefrontBooks after loadCatalog: the document's fields, then its id.
    books.push(...docs.map(d => ({ ...fieldsOf(d), id: docId(d) })));
    if (docs.length < pageSize) break;
    after = docs.at(-1).name;
  }
  const pageRows = await post(fetchImpl, `${base}:runQuery`, { readTime, structuredQuery: publishedQuery('pages') });
  // Same shape as publicApi.getPublishedPages before sorting: id first, then the document's fields.
  const pages = (Array.isArray(pageRows) ? pageRows : []).filter(r => r && r.document).map(r => ({ id: docId(r.document), ...fieldsOf(r.document) }));

  // Shipping profiles are optional in the file: if they can't be read or stored exactly, the file is still written
  // without them and the browser reads the profiles from Firestore as before.
  let shippingProfiles;
  try { shippingProfiles = await readShippingProfiles(base, fetchImpl, readTime); } catch { shippingProfiles = undefined; }

  return { v: STOREFRONT_DATA_VERSION, readTime, builtAt: new Date().toISOString(), settings, books, pages, ...(shippingProfiles ? { shippingProfiles } : {}) };
}

/**
 * Every public shipping profile, in the shape and order of publicApi.getShippingProfiles (`{ id, ...data }`, by
 * document id). `readTime` reads them at the file's snapshot; without it, the current profiles.
 */
export async function readShippingProfiles(base, fetchImpl = fetch, readTime = undefined) {
  const rows = await post(fetchImpl, `${base}:runQuery`, {
    ...(readTime ? { readTime } : {}),
    structuredQuery: { from: [{ collectionId: 'shipping-profiles' }], orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }] },
  });
  return (Array.isArray(rows) ? rows : []).filter(r => r && r.document).map(r => ({ id: docId(r.document), ...fieldsOf(r.document) }));
}

const stableJson = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);

/**
 * True when the deployed file carries shipping profiles that differ from the current ones. The marker normally
 * reports a profile change; this is the backstop for a marker write that failed every retry, so the scheduled
 * refresh still rebuilds the file. A file without profiles (or no file) says nothing.
 */
export function shippingProfilesDiffer(file, currentProfiles) {
  if (!file || typeof file !== 'object' || file.v !== STOREFRONT_DATA_VERSION || !Array.isArray(file.shippingProfiles)) return false;
  if (!Array.isArray(currentProfiles)) return false;
  return stableJson(file.shippingProfiles) !== stableJson(currentProfiles);
}

/** RFC 3339 UTC time → sortable "YYYY-MM-DDTHH:MM:SS.nnnnnnnnn" (mirrors nanoTime in features/site/storefrontDataFile.ts). */
export function nanoTime(value) {
  const m = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  return m ? `${m[1]}.${(m[2] || '').padEnd(9, '0')}` : null;
}

/**
 * True when settings/catalogVersion (its Firestore REST document) records a change after the deployed file's
 * snapshot: shoppers are then reading Firestore, so the scheduled refresh rebuilds the file even if the published
 * fingerprint didn't move (a save that changed nothing shoppers see). A missing file or marker says nothing, so a
 * build that can't write the file never rebuilds every 15 minutes.
 */
export function markerNewerThanFile(markerDocument, file) {
  const changed = nanoTime(markerDocument?.fields?.changedAt?.timestampValue);
  const read = file && typeof file === 'object' && file.v === STOREFRONT_DATA_VERSION ? nanoTime(file.readTime) : null;
  return !!changed && !!read && changed > read;
}
