// The shop's Firebase project and site address for build scripts, read from public/shop-profile.js: the same file
// src/lib/shopProfile.ts reads in the browser, so the build and the page always agree on which shop this is.
import { readFile } from 'node:fs/promises';

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
