// URL redirects (Shopify "Navigation › URL redirects"): the owner maps an old address to a new one so bookmarks, search
// results and printed links keep working after a book or page is renamed. Pure and storefront-safe.
//
// Storage (plan 5.6): the list is kept in numbered pages of `REDIRECTS_PER_PAGE` in the public, admin-written
// `redirects` collection (`redirects/1`, `redirects/2`, … each `{ items: Redirect[] }`), up to `MAX_REDIRECTS` in all.
// Shops saved before then keep one `settings/redirects` doc ({ items }); it is still read while no page exists, and
// the first save moves its list into the pages and marks it `paged: true` (items emptied), so a later empty list never
// brings the old one back. Every reader goes through `redirectsFromStore`, and every save through `redirectsToPages`.
//
// Hosting answers unknown and missing-item URLs with the app shell, so redirects are followed in the browser
// (`useMissingRedirect`) only when the page the shopper asked for does not exist. A real page is never hijacked.

export type Redirect = { from: string; to: string };

/** The legacy single document, `settings/redirects`. */
export const REDIRECTS_DOC = "redirects";
/** The collection of numbered pages: `redirects/1` … `redirects/10`. */
export const REDIRECTS_COLLECTION = "redirects";
export const REDIRECTS_PER_PAGE = 500;
export const MAX_REDIRECT_PAGES = 10;
export const MAX_REDIRECTS = REDIRECTS_PER_PAGE * MAX_REDIRECT_PAGES;
/** Chains followed in one visit (a → b → c); stops loops that slipped past the editor. */
export const MAX_REDIRECT_HOPS = 5;

/** Paths the redirect list must never claim: the app's own routes. */
const RESERVED = /^\/(admin|checkout|track|account|wishlist)(\/|$)/;

/** "/Books/Old-Title/?x=1#y" → "/books/old-title"; "" if it is not an on-site path. */
export function normalizePath(input: string): string {
  let s = String(input || "").trim();
  if (!s || /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return "";
  s = s.replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  if (!s) return "/";
  try { s = decodeURI(s); } catch { /* keep as typed */ }
  return s.toLowerCase();
}

/** The destination as saved: an on-site path (kept as typed, with query/hash) or an https address. "" if unusable. */
export function normalizeTarget(input: string): string {
  const s = String(input || "").trim().slice(0, 500);
  if (!s || /\s/.test(s)) return "";
  if (/^https:\/\/[^/\s]+/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith("//")) return "";
  return s.startsWith("/") ? s : "/" + s;
}

export function isExternalTarget(to: string): boolean { return /^https:\/\//i.test(to); }

/** Normalised old address → saved destination, first one wins (as `Array.find` would). */
export type RedirectIndex = Map<string, string>;

export function redirectIndex(list: Redirect[]): RedirectIndex {
  const index: RedirectIndex = new Map();
  for (const r of list) addToIndex(index, r);
  return index;
}

export function addToIndex(index: RedirectIndex, r: Redirect): void {
  const from = normalizePath(r.from);
  if (!index.has(from)) index.set(from, normalizeTarget(r.to));
}

/** `redirectProblem` against an index of the other redirects, so long lists stay quick to check. */
export function redirectProblemIn(item: { from: string; to: string }, index: RedirectIndex): string {
  const from = normalizePath(item.from);
  const to = normalizeTarget(item.to);
  if (!from) return "The old address must be a path on this shop, like /books/old-title.";
  if (from === "/") return "The home page can't be redirected.";
  if (RESERVED.test(from)) return "That address belongs to the shop itself (checkout, account, admin…) and can't be redirected.";
  if (!to) return "The new address must be a path on this shop (/books/new-title) or a full https:// link.";
  if (!isExternalTarget(to) && normalizePath(to) === from) return "The old and new address are the same.";
  if (index.has(from)) return "That old address already has a redirect.";
  // A loop: following the new address through the existing rules leads back to the old one.
  let at = isExternalTarget(to) ? "" : normalizePath(to);
  for (let i = 0; at && i < MAX_REDIRECT_HOPS + 1; i++) {
    if (at === from) return "This would loop back to itself through another redirect.";
    const next = index.get(at);
    at = next !== undefined && !isExternalTarget(next) ? normalizePath(next) : "";
  }
  return "";
}

/** Why a redirect can't be saved, in the owner's words; "" when it is fine. `others` = the rest of the list. */
export function redirectProblem(item: { from: string; to: string }, others: Redirect[]): string {
  return redirectProblemIn(item, redirectIndex(others));
}

/** The list as saved: valid, loop-free, unique old addresses, at most MAX_REDIRECTS, old addresses stored normalised. */
export function cleanRedirects(list: any): Redirect[] {
  const out: Redirect[] = [];
  const index: RedirectIndex = new Map();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    if (redirectProblemIn(raw, index)) continue;
    const item = { from: normalizePath(raw.from), to: normalizeTarget(raw.to) };
    out.push(item);
    addToIndex(index, item);
    if (out.length >= MAX_REDIRECTS) break;
  }
  return out;
}

/** The pages a cleaned list is saved as, in order: page 1 holds the first 500, page 2 the next, and so on. */
export function redirectsToPages(list: Redirect[]): { id: string; items: Redirect[] }[] {
  const clean = cleanRedirects(list);
  const pages: { id: string; items: Redirect[] }[] = [];
  for (let i = 0; i < clean.length; i += REDIRECTS_PER_PAGE) {
    pages.push({ id: String(pages.length + 1), items: clean.slice(i, i + REDIRECTS_PER_PAGE) });
  }
  return pages;
}

/** Page ids a save may write or must clear: "1" … "10". */
export const redirectPageIds = (): string[] => Array.from({ length: MAX_REDIRECT_PAGES }, (_, i) => String(i + 1));

/**
 * The one way to read the list back, from the numbered pages and the legacy `settings/redirects` doc. Pages are read
 * in number order (only "1"…"10"); while none exists and the legacy doc was never moved, its list is used instead.
 */
export function redirectsFromStore(store: { pages?: { id: string; items?: unknown }[] | null; legacy?: { items?: unknown; paged?: unknown } | null }): Redirect[] {
  const ids = new Set(redirectPageIds());
  const pages = (store.pages || []).filter(p => ids.has(p.id)).sort((a, b) => Number(a.id) - Number(b.id));
  if (pages.length || store.legacy?.paged === true) {
    return cleanRedirects(pages.flatMap(p => (Array.isArray(p.items) ? p.items : [])));
  }
  return cleanRedirects(store.legacy?.items);
}

/** Where a missing page's address should go, or null. Case, trailing slash and query are ignored on the old address. */
export function findRedirect(list: Redirect[] | null | undefined, pathname: string): string | null {
  const here = normalizePath(pathname);
  if (!here || here === "/" || !Array.isArray(list)) return null;
  const hit = list.find(r => normalizePath(r.from) === here);
  const to = hit ? normalizeTarget(hit.to) : "";
  return to || null;
}

/** Parse a pasted list: one "old, new" (or tab-separated) pair per line; returns usable pairs and the skipped lines. */
export function parseRedirectLines(text: string, existing: Redirect[]): { added: Redirect[]; skipped: { line: string; why: string }[] } {
  const added: Redirect[] = [];
  const skipped: { line: string; why: string }[] = [];
  const index = redirectIndex(existing);
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*(from|old)\b[^/]*[,\t]/i.test(line)) continue; // header row
    const parts = line.split(/\t|,(?=\s*(?:\/|https:\/\/))/).map(p => p.trim());
    if (parts.length < 2) { skipped.push({ line, why: "Needs an old and a new address separated by a comma." }); continue; }
    const why = redirectProblemIn({ from: parts[0], to: parts[1] }, index);
    if (why) { skipped.push({ line, why }); continue; }
    const item = { from: normalizePath(parts[0]), to: normalizeTarget(parts[1]) };
    added.push(item);
    addToIndex(index, item);
  }
  return { added, skipped };
}
