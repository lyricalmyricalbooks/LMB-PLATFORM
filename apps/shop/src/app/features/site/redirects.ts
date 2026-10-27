// URL redirects (Shopify "Navigation › URL redirects"): the owner maps an old address to a new one so bookmarks, search
// results and printed links keep working after a book or page is renamed. Rules live in the public, admin-written
// `settings/redirects` doc ({ items: Redirect[] }), so no new Firestore rules are needed. Pure and storefront-safe.
//
// Hosting answers unknown and missing-item URLs with the app shell, so redirects are followed in the browser
// (`useMissingRedirect`) only when the page the shopper asked for does not exist. A real page is never hijacked.

export type Redirect = { from: string; to: string };

export const REDIRECTS_DOC = "redirects";
export const MAX_REDIRECTS = 500;
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

/** Why a redirect can't be saved, in the owner's words; "" when it is fine. `others` = the rest of the list. */
export function redirectProblem(item: { from: string; to: string }, others: Redirect[]): string {
  const from = normalizePath(item.from);
  const to = normalizeTarget(item.to);
  if (!from) return "The old address must be a path on this shop, like /books/old-title.";
  if (from === "/") return "The home page can't be redirected.";
  if (RESERVED.test(from)) return "That address belongs to the shop itself (checkout, account, admin…) and can't be redirected.";
  if (!to) return "The new address must be a path on this shop (/books/new-title) or a full https:// link.";
  if (!isExternalTarget(to) && normalizePath(to) === from) return "The old and new address are the same.";
  if (others.some(o => normalizePath(o.from) === from)) return "That old address already has a redirect.";
  // A loop: following the new address through the existing rules leads back to the old one.
  let at = isExternalTarget(to) ? "" : normalizePath(to);
  for (let i = 0; at && i < MAX_REDIRECT_HOPS + 1; i++) {
    if (at === from) return "This would loop back to itself through another redirect.";
    const next = others.find(o => normalizePath(o.from) === at);
    at = next && !isExternalTarget(normalizeTarget(next.to)) ? normalizePath(next.to) : "";
  }
  return "";
}

/** The list as saved: valid, loop-free, unique old addresses, at most MAX_REDIRECTS, old addresses stored normalised. */
export function cleanRedirects(list: any): Redirect[] {
  const out: Redirect[] = [];
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== "object") continue;
    if (redirectProblem(raw, out)) continue;
    out.push({ from: normalizePath(raw.from), to: normalizeTarget(raw.to) });
    if (out.length >= MAX_REDIRECTS) break;
  }
  return out;
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
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (/^\s*(from|old)\b[^/]*[,\t]/i.test(line)) continue; // header row
    const parts = line.split(/\t|,(?=\s*(?:\/|https:\/\/))/).map(p => p.trim());
    if (parts.length < 2) { skipped.push({ line, why: "Needs an old and a new address separated by a comma." }); continue; }
    const why = redirectProblem({ from: parts[0], to: parts[1] }, [...existing, ...added]);
    if (why) skipped.push({ line, why });
    else added.push({ from: normalizePath(parts[0]), to: normalizeTarget(parts[1]) });
  }
  return { added, skipped };
}
