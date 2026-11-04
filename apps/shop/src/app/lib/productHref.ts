// A product's address in this shop (plan 12.18): /books/<slug> in a books shop, /products/<slug> in any other
// (shared/shopSells.ts productBase). What the shop sells is one answer for the whole shop, so the storefront
// (useSiteData) and the admin (Dashboard) set it once here and every link reads it. Until it is known, links use
// /books/, which opens every product page too.
import { productBase, type ProductBase } from "../../shared/shopSells";

let base: ProductBase = "books";

/** Called with what the shop sells whenever that answer is read. */
export function setProductSells(answer?: string | null): void {
  base = productBase(answer);
}

/** "/books/<slug>" or "/products/<slug>"; the slug is used as given (callers encode where they did before). */
export function productHref(slug: string): string {
  return `/${base}/${slug}`;
}

/** "books" or "products": for addresses built without a leading slash (`${BASE_URL}${productSegment()}/…`). */
export function productSegment(): ProductBase {
  return base;
}

/** A path's product slug when it is a product page address (either first part), else null. */
export function productSlugOf(path: string): string | null {
  return /^\/(?:books|products)\/([^/?#]+)/.exec(path)?.[1] ?? null;
}

/** True for a product page address, "/books/…" or "/products/…". */
export const isProductPath = (path: string) => /^\/(?:books|products)\//.test(path);
