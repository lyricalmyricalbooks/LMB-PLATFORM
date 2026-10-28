// The shop's Firebase project and site address for build scripts, read from public/shop-profile.js: the same file
// src/lib/shopProfile.ts reads in the browser, so the build and the page always agree on which shop this is.
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHOP_PROFILE_FILE = new URL('../public/shop-profile.js', import.meta.url);

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

// The one-off switches (src/lib/shopProfile.ts SHOP_SWITCHES): on only when the profile says `true`.
export const SHOP_SWITCHES = ['legacyStockroomSignIn', 'githubPagesForwarding', 'gmailReceiptFinder', 'gmailOrderScan', 'oldShopSync'];

/** "true" or "false" for one switch, for the deploy workflows. An unknown switch name throws. */
export function switchValue(name, profile = readShopProfileSync()) {
  if (!SHOP_SWITCHES.includes(name)) throw new Error(`"${name}" is not a shop switch (${SHOP_SWITCHES.join(', ')})`);
  return String(profile?.switches?.[name] === true);
}

// `node scripts/shopProfile.mjs <siteUrl|projectId|functionsRegion>` prints that value, and
// `node scripts/shopProfile.mjs switch <name>` prints true or false (deploy workflows).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(process.argv[2] === 'switch' ? switchValue(process.argv[3]) : profileValue(process.argv[2]));
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
