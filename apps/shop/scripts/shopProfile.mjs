// The shop's Firebase project and site address for build scripts, read from public/shop-profile.js: the same file
// src/lib/shopProfile.ts reads in the browser, so the build and the page always agree on which shop this is.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SHOP_PROFILE_FILE in the environment points the build at another shop's profile: the shared system's publish run
// (LMB-PLATFORM docs/shared-system.md) builds each shop's own pages, sitemap and catalogue file this way.
export const SHOP_PROFILE_FILE = process.env.SHOP_PROFILE_FILE
  ? pathToFileURL(resolve(process.env.SHOP_PROFILE_FILE))
  : new URL('../public/shop-profile.js', import.meta.url);
// Where the build scripts read the app and write the shop's files. SHOP_BUILD_DIR points the publish run at its own
// copy of the built app, so one shop's sitemap and pages never land in another's.
export const SHOP_BUILD_DIR = resolve(process.env.SHOP_BUILD_DIR || fileURLToPath(new URL('../dist', import.meta.url)));

export function parseProfileScript(text) {
  const json = String(text).match(/window\.__SHOP_PROFILE__\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)?.[1];
  if (!json) throw new Error('public/shop-profile.js does not set window.__SHOP_PROFILE__');
  return JSON.parse(json);
}

export async function readShopProfile(file = SHOP_PROFILE_FILE) {
  return parseProfileScript(await readFile(file, 'utf8'));
}

export async function shopProjectId(file = SHOP_PROFILE_FILE) {
  const project = (await readShopProfile(file)).firebase?.projectId;
  if (!project) throw new Error('Firebase project ID missing from public/shop-profile.js');
  return project;
}

/**
 * The shop's folder in the shared database, as the Firestore REST address every build read starts from:
 * https://firestore.googleapis.com/v1/projects/<project>/databases/(default)/documents/shops/<shopId>. The shared
 * system keeps each shop's data there; a read from the database root would find nothing.
 */
export async function shopDocumentsBase(file = SHOP_PROFILE_FILE) {
  const profile = await readShopProfile(file);
  const project = profile.firebase?.projectId;
  const shopId = profile.shopId;
  if (!project) throw new Error('Firebase project ID missing from the shop profile');
  if (typeof shopId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(shopId)) throw new Error('The shop profile has no usable shop id');
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/shops/${shopId}`;
}

// SITE_URL still wins, so a build for another address (a preview, a sub-path) works as before.
export async function shopSiteUrl(file = SHOP_PROFILE_FILE, env = process.env) {
  const siteUrl = env.SITE_URL || (await readShopProfile(file)).siteUrl;
  if (!siteUrl) throw new Error('Site address missing: set SITE_URL or siteUrl in public/shop-profile.js');
  return siteUrl.replace(/\/+$/, '');
}

/** One value from the profile for the deploy workflows: siteUrl, projectId or functionsRegion. Throws when missing. */
export function profileValue(name, profile = readShopProfileSync()) {
  const value = { siteUrl: profile.siteUrl, projectId: profile.firebase?.projectId, functionsRegion: profile.functionsRegion }[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} missing from public/shop-profile.js`);
  return name === 'siteUrl' ? value.trim().replace(/\/+$/, '') : value.trim();
}

// `node scripts/shopProfile.mjs <siteUrl|projectId|functionsRegion>` prints that value (deploy workflows).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(profileValue(process.argv[2]));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// The same reads, synchronously, for code that can't wait (vite.config.ts plugins, module constants).
export function readShopProfileSync(file = SHOP_PROFILE_FILE) {
  return parseProfileScript(readFileSync(file, 'utf8'));
}

export function shopProjectIdSync(file = SHOP_PROFILE_FILE) {
  const project = readShopProfileSync(file).firebase?.projectId;
  if (!project) throw new Error('Firebase project ID missing from public/shop-profile.js');
  return project;
}

export function shopSiteUrlSync(file = SHOP_PROFILE_FILE, env = process.env) {
  const siteUrl = env.SITE_URL || readShopProfileSync(file).siteUrl;
  if (!siteUrl) throw new Error('Site address missing: set SITE_URL or siteUrl in public/shop-profile.js');
  return siteUrl.replace(/\/+$/, '');
}
