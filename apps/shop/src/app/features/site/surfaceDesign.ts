import { layerDesign } from "./designModel";

/** Resolve page overrides over root tokens; keep template trees available. */
// A stray "%" in a typed URL (e.g. /page/50%-off) must not crash the page.
const safeDecode = (value: string) => { try { return decodeURIComponent(value); } catch { return value; } };

export function resolveSurfaceDesign(design: any, pathname: string) {
  if (!design) return design;
  const template = pathname.startsWith("/books/") ? "productPage"
    : pathname.startsWith("/collections/") ? "collectionPage"
    : pathname === "/checkout" ? "cartPage"
    : pathname.startsWith("/page/") ? "page"
    : pathname === "/wishlist" ? "wishlistPage"
    : pathname === "/account" || pathname.startsWith("/account/") ? "accountPage"
    : pathname === "/track" ? "trackingPage"
    : pathname !== "/" && !pathname.startsWith("/admin") ? "page404" : null;
  if (!template) return design;
  const custom = template === "page" ? design[`page:${safeDecode(pathname.slice(6))}`] : null;
  if (!design[template] && !custom) return design;
  return layerDesign(design, design[template], custom);
}

/** MainSite owns home, catalog and routed collections; their tokens must follow the active canvas. */
// Alternate collection templates (Studio 2.8) bring their own sections only; collection pages style from the default.
export function resolveMainDesign(design: any, catalog: boolean, collection: boolean) {
  const base = design || {};
  const primary = collection || catalog ? base.storefront : base.heroPage;
  const local = collection ? base.collectionPage : null;
  return layerDesign(base, primary, local);
}

/** Product controls inherit catalog defaults, then retain the product canvas overrides (and an alternate's, 2.8). */
export function resolveProductDesign(design: any, productSurface = "productPage") {
  const base = design || {};
  return layerDesign(base, base.storefront, base.productPage, productSurface !== "productPage" ? base[productSurface] : null);
}
