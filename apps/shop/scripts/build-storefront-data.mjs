// Writes dist/storefront-data.json (see scripts/storefrontDataFile.mjs). Never fails the build: without the file
// the storefront reads Firestore exactly as before.
import { rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SHOP_BUILD_DIR, shopDocumentsBase, shopProjectId } from './shopProfile.mjs';
import { STOREFRONT_DATA_FILE, readStorefrontData } from './storefrontDataFile.mjs';

const out = resolve(SHOP_BUILD_DIR, STOREFRONT_DATA_FILE);
try {
  const project = await shopProjectId();
  const base = await shopDocumentsBase();
  const data = await readStorefrontData(base, project);
  await writeFile(out, JSON.stringify(data));
  console.log(`${STOREFRONT_DATA_FILE}: ${data.books.length} books, ${data.pages.length} pages, ${data.shippingProfiles ? `${data.shippingProfiles.length} shipping profiles` : 'no shipping profiles (read from Firestore)'} at ${data.readTime}`);
} catch (error) {
  await rm(out, { force: true });
  console.warn(`::warning::${STOREFRONT_DATA_FILE} not written (${error.message}); the storefront will read Firestore.`);
}
