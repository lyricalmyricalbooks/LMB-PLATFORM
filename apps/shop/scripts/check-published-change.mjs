import { appendFile, readFile } from 'node:fs/promises';
import { readPublicStorefront, publishedFingerprint } from './publicStorefrontData.mjs';
import { isFingerprint } from './assetManifest.mjs';
import { STOREFRONT_DATA_FILE, markerNewerThanFile, readShippingProfiles, shippingProfilesDiffer } from './storefrontDataFile.mjs';
const siteUrl = (process.env.SITE_URL || 'https://lmb-test-shop.web.app').replace(/\/$/, '');
const fingerprint = publishedFingerprint(await readPublicStorefront());
let previous = '';
try {
  const response = await fetch(`${siteUrl}/seo-published-fingerprint.txt?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' });
  // Only a real digest counts; an HTML page answering for a missing marker means "rebuild".
  if (response.ok) { const text = (await response.text()).trim(); if (isFingerprint(text)) previous = text; }
} catch { /* Missing marker or unavailable deployment triggers a rebuild. */ }
let changed = fingerprint !== previous;
// The catalog file (storefront-data.json) is used only while nothing was written after its snapshot. A save that
// changes nothing published still marks it out of date, so rebuild then too, or shoppers keep reading Firestore.
if (!changed) {
  try {
    const config = await readFile(new URL('../src/lib/firebaseApp.ts', import.meta.url), 'utf8');
    const project = config.match(/projectId:\s*"([^"]+)"/)?.[1];
    const [fileResponse, markerResponse] = await Promise.all([
      fetch(`${siteUrl}/${STOREFRONT_DATA_FILE}?check=${Date.now()}`, { signal: AbortSignal.timeout(30000), cache: 'no-store' }),
      fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/settings/catalogVersion`, { signal: AbortSignal.timeout(30000) }),
    ]);
    const file = fileResponse.ok && /json/.test(fileResponse.headers.get('content-type') || '') ? await fileResponse.json() : null;
    const marker = markerResponse.ok ? await markerResponse.json() : null;
    if (markerNewerThanFile(marker, file)) {
      changed = true;
      console.log('The catalog file is older than the last catalog change; rebuilding it.');
    } else if (file?.shippingProfiles) {
      // Shipping profiles aren't in the published fingerprint; compare them directly in case a marker write failed.
      const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
      if (shippingProfilesDiffer(file, await readShippingProfiles(base))) {
        changed = true;
        console.log("The catalog file's shipping profiles differ from Firestore's; rebuilding it.");
      }
    }
  } catch { /* No file or marker information: the fingerprint alone decides. */ }
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
console.log(changed ? 'Published content changed; rebuild required.' : 'Published content unchanged; deployment skipped.');
