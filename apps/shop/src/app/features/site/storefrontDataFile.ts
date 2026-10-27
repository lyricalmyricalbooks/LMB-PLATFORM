// The catalog file on Firebase Hosting (scripts/storefrontDataFile.mjs writes it at build time). It holds the
// published books, settings/website and published pages exactly as Firestore had them at one snapshot (`readTime`).
// The browser uses it only when `settings/catalogVersion` says nothing changed since that snapshot
// (functions/catalogVersion.js stamps the server time after every write to a book, a page or settings/website), so a
// shopper sees the same thing a Firestore read would show, for one document read instead of the whole catalog.
// Newer files also carry the public shipping profiles (a profile write stamps the same marker); a file without them
// leaves the profiles to Firestore (`shippingProfilesFrom`).
// Anything unexpected (no file, an old file, no marker, a newer change) returns null and the caller reads Firestore.

export const STOREFRONT_DATA_FILE = "storefront-data.json";
export const STOREFRONT_DATA_VERSION = 1;

export type StorefrontDataFile = {
  v: number;
  readTime: string;
  builtAt?: string;
  settings: Record<string, unknown> | null;
  books: Record<string, unknown>[];
  pages: Record<string, unknown>[];
  /** Same shape and order as publicApi.getShippingProfiles; absent in files built before it was added. */
  shippingProfiles?: Record<string, unknown>[];
};

/**
 * A Firestore time → sortable "YYYY-MM-DDTHH:MM:SS.nnnnnnnnn" (Firestore times carry nanoseconds). Takes an
 * RFC 3339 UTC string (the file's readTime) or a Timestamp (the marker, read through the SDK).
 */
export function nanoTime(value: unknown): string | null {
  const ts = value as { seconds?: unknown; nanoseconds?: unknown } | null;
  if (ts && typeof ts === "object" && Number.isInteger(ts.seconds) && Number.isInteger(ts.nanoseconds)) {
    const date = new Date((ts.seconds as number) * 1000);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.toISOString().slice(0, 19)}.${String(ts.nanoseconds).padStart(9, "0")}`;
  }
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  return m ? `${m[1]}.${(m[2] || "").padEnd(9, "0")}` : null;
}

export function isStorefrontDataFile(value: unknown): value is StorefrontDataFile {
  const f = value as StorefrontDataFile | null;
  return !!f && typeof f === "object" && f.v === STOREFRONT_DATA_VERSION && !!nanoTime(f.readTime)
    && Array.isArray(f.books) && Array.isArray(f.pages) && (f.settings === null || (typeof f.settings === "object" && !Array.isArray(f.settings)));
}

/** True when no book, page or settings/website write happened after the file's snapshot. */
export function fileIsCurrent(file: StorefrontDataFile, marker: unknown): boolean {
  const changed = nanoTime((marker as { changedAt?: unknown } | null)?.changedAt);
  const read = nanoTime(file.readTime);
  return !!changed && !!read && changed <= read;
}

/** The file's shipping profiles, or null when this file doesn't carry them (read Firestore then). */
export function shippingProfilesFrom(file: StorefrontDataFile | null): any[] | null {
  const profiles = file?.shippingProfiles;
  return Array.isArray(profiles) && profiles.every(p => !!p && typeof p === "object" && typeof (p as any).id === "string") ? profiles : null;
}

// Several readers on one page (the shop data, a book page's shipping figure, checkout) share one check of the file
// and the marker. A check is reused for SHARE_MS from when it started, the same window the shop's own data is
// reused for (useSiteData SITE_DATA_FRESH_MS), so sharing never keeps an answer longer than the shop data already is.
const SHARE_MS = 30_000;
let shared: { fetchFile: unknown; readMarker: unknown; at: number; result: Promise<StorefrontDataFile | null> } | null = null;

/**
 * The file's contents when they are current, else null. `fetchFile` downloads the file (revalidated with Hosting,
 * which purges it on every deploy) and `readMarker` reads settings/catalogVersion; both run at once. Calls with the
 * same two readers within SHARE_MS share one check; `fresh` always checks again (checkout, which shows prices and
 * stock before Pay, never relies on an earlier check), and later readers share that newer check.
 */
export function currentStorefrontData(
  fetchFile: () => Promise<unknown>,
  readMarker: () => Promise<unknown>,
  { now = Date.now(), fresh = false }: { now?: number; fresh?: boolean } = {},
): Promise<StorefrontDataFile | null> {
  if (fresh || !(shared && shared.fetchFile === fetchFile && shared.readMarker === readMarker && now >= shared.at && now - shared.at < SHARE_MS)) {
    shared = { fetchFile, readMarker, at: now, result: checkStorefrontData(fetchFile, readMarker) };
  }
  // Each reader gets its own copy, so one that adjusts what it was given can't change another's.
  return shared.result.then(file => (file ? copyOf(file) : null));
}

export const CHECK_DEADLINE_MS = 3_000;
function withDeadline<T>(work: Promise<T>, ms = CHECK_DEADLINE_MS): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([work.catch(() => null), deadline]).finally(() => clearTimeout(timer));
}

const copyOf =<T,>(value: T): T => (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));

async function checkStorefrontData(
  fetchFile: () => Promise<unknown>,
  readMarker: () => Promise<unknown>,
): Promise<StorefrontDataFile | null> {
  try {
    // A stalled download or marker read never holds up the page (checkout's Pay waits on this): after the deadline
    // the answer is null and the caller reads Firestore.
    const [file, marker] = await Promise.all([withDeadline(fetchFile()), withDeadline(readMarker())]);
    if (!isStorefrontDataFile(file) || !fileIsCurrent(file, marker)) return null;
    return file;
  } catch {
    return null;
  }
}

export async function fetchStorefrontDataFile(base: string = (import.meta as any).env?.BASE_URL || "/"): Promise<unknown> {
  if (typeof fetch !== "function") return null;
  const response = await fetch(`${base.replace(/\/?$/, "/")}${STOREFRONT_DATA_FILE}`, { credentials: "same-origin" });
  if (!response.ok || !/json/.test(response.headers.get("content-type") || "")) return null;
  return response.json();
}
