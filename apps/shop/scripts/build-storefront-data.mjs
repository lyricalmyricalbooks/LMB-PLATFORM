// Writes dist/storefront-data.json (see scripts/storefrontDataFile.mjs). Never fails the build: without the file
// the storefront reads Firestore exactly as before.
import { readFile, rm, writeFile } from 'node:fs/promises';
import { STOREFRONT_DATA_FILE, readStorefrontData } from './storefrontDataFile.mjs';

const out = new URL(`../dist/${STOREFRONT_DATA_FILE}`, import.meta.url);
try {
  const config = await readFile(new URL('../src/lib/firebaseApp.ts', import.meta.url), 'utf8');
  const project = config.match(/projectId:\s*"([^"]+)"/)?.[1];
  if (!project) throw new Error('Firebase project ID missing');
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const data = await readStorefrontData(base, project);
  await writeFile(out, JSON.stringify(data));
  console.log(`${STOREFRONT_DATA_FILE}: ${data.books.length} books, ${data.pages.length} pages, ${data.shippingProfiles ? `${data.shippingProfiles.length} shipping profiles` : 'no shipping profiles (read from Firestore)'} at ${data.readTime}`);
} catch (error) {
  await rm(out, { force: true });
  console.warn(`::warning::${STOREFRONT_DATA_FILE} not written (${error.message}); the storefront will read Firestore.`);
}
