/**
 * Shareable wishlist (Shopify-style "share your wishlist"): the saved book ids travel in the
 * link itself (`/wishlist?shared=id1,id2`), so nothing is stored and nobody's list is public.
 * Off until Studio › Style › Book cards in the shop grid › Wishlist share button (`showWishlistShare`).
 */
export const MAX_SHARED_BOOKS = 60;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Clean, de-duplicated ids (bad or excess ones dropped). */
export function cleanSharedIds(ids: unknown[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (ID.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= MAX_SHARED_BOOKS) break;
  }
  return out;
}

/** The ids a shared link carries, or null when the address isn't a shared list. */
export function sharedWishlistIds(search: string): string[] | null {
  let value: string | null = null;
  try { value = new URLSearchParams(search || "").get("shared"); } catch { value = null; }
  if (value == null) return null;
  return cleanSharedIds(value.split(","));
}

/** The link to share: `<origin><base>wishlist?shared=…` ("" when nothing is saved). */
export function wishlistShareUrl(ids: string[], origin: string, base = "/"): string {
  const clean = cleanSharedIds(ids);
  if (!clean.length) return "";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${origin}${root}wishlist?shared=${clean.join(",")}`;
}

/** Shared ids not yet on this shopper's own list (what "Save to my wishlist" adds). */
export function idsToMerge(own: string[], shared: string[]): string[] {
  return shared.filter(id => !own.includes(id));
}
