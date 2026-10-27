import { SITE_CACHE_KEY } from "./constants";
import type { Book, Page, SiteSettings } from "./types";

export type SiteCachePayload = {
  books: Book[];
  settings: SiteSettings;
  pages: Page[];
  cachedAt: string;
};

// The snapshot is a few hundred KB of JSON and many page parts read it (cookie banner, toaster, splash, GA
// lists…), each again after every write. Parse each stored text once: on a phone every extra parse cost
// tens of milliseconds of blocked main thread. Readers treat the result as read-only, like the shared site data.
let parsedText: string | null = null;
let parsedValue: unknown = null;

export function readSiteCache(): SiteCachePayload | null {
  try {
    const cached = sessionStorage.getItem(SITE_CACHE_KEY);
    if (!cached) return null;

    if (cached !== parsedText) {
      parsedText = null;
      parsedValue = JSON.parse(cached);
      parsedText = cached;
    }
    const parsed: unknown = parsedValue;
    // This cache survives client-side navigation and may have been written by
    // an older release. Never allow a stale or partially-written snapshot to
    // become authoritative component state: product and checkout pages both
    // iterate these collections during their first render.
    if (!parsed || typeof parsed !== "object") return null;
    const payload = parsed as Partial<SiteCachePayload>;
    if (!Array.isArray(payload.books) || !Array.isArray(payload.pages)) return null;
    if (!payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) return null;

    return payload as SiteCachePayload;
  } catch {
    return null;
  }
}

export const SITE_CACHE_EVENT = "fm:site-cache-updated";

// Every page part that loads the site data (shop grid, bag, recently viewed…) writes the same answer.
// Store and announce it once; a write with other books, pages or settings goes through as before.
let lastWritten: SiteCachePayload | null = null;
let lastWrittenText: string | null = null;

function sameSettings(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
}

export function writeSiteCache(payload: SiteCachePayload) {
  try {
    const last = lastWritten;
    if (last && last.books === payload.books && last.pages === payload.pages && sameSettings(last.settings, payload.settings)
      && sessionStorage.getItem(SITE_CACHE_KEY) === lastWrittenText) return;
    const text = JSON.stringify(payload);
    sessionStorage.setItem(SITE_CACHE_KEY, text);
    lastWritten = payload;
    lastWrittenText = text;
    // Chrome outside the data pipeline (under-construction wall, cookie banner) refreshes from this.
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SITE_CACHE_EVENT));
  } catch {
    // Ignore quota and private-mode errors; Firestore remains the fallback.
  }
}
