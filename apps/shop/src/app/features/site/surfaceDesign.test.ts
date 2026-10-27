import { expect, it } from "vitest";
import { resolveSurfaceDesign, resolveMainDesign, resolveProductDesign } from "./surfaceDesign";

it("inherits cleared page overrides and preserves template stacks", () => {
  const design = { primaryColor: "red", page: { backgroundColor: "black", sections: [1] }, "page:about": { primaryColor: "blue", sections: [2] } };
  expect(resolveSurfaceDesign(design, "/page/about")).toMatchObject({ primaryColor: "blue", backgroundColor: "black", "page:about": { sections: [2] } });
  expect(resolveSurfaceDesign({ ...design, "page:about": { sections: [2] } }, "/page/about").primaryColor).toBe("red");
  expect(resolveSurfaceDesign(design, "/account")).toBe(design);
});

it("uses the correct product and checkout surfaces without touching commerce settings", () => {
  const design = { primaryColor: "red", productPage: { primaryColor: "green" }, cartPage: { primaryColor: "blue" } };
  expect(resolveSurfaceDesign(design, "/books/poems").primaryColor).toBe("green");
  expect(resolveSurfaceDesign(design, "/checkout").primaryColor).toBe("blue");
});

it("uses the home and collection settings on the routed storefront, retaining catalog defaults", () => {
  const d = { backgroundColor: "root", heroPage: { backgroundColor: "home" },
    storefront: { backgroundColor: "catalog", cardGap: 16, regions: { searchAuthorVisible: false } },
    collectionPage: { backgroundColor: "collection", regions: { searchPhotoVisible: false } } };
  expect(resolveMainDesign(d, false, false).backgroundColor).toBe("home");
  expect(resolveMainDesign(d, true, false).backgroundColor).toBe("catalog");
  expect(resolveMainDesign(d, true, true)).toMatchObject({ backgroundColor: "collection", cardGap: 16,
    regions: { searchAuthorVisible: false, searchPhotoVisible: false } });
});

it("resolves wishlist, account, tracking and recovery page overrides", () => {
  const design = { backgroundColor: "root", regions: { shared: 1, title: 12 },
    wishlistPage: { backgroundColor: "wishlist", regions: { title: 24 } },
    accountPage: { backgroundColor: "account" }, trackingPage: { backgroundColor: "tracking" },
    page404: { backgroundColor: "missing" } };
  expect(resolveSurfaceDesign(design, "/wishlist")).toMatchObject({ backgroundColor: "wishlist", regions: { shared: 1, title: 24 } });
  expect(resolveSurfaceDesign(design, "/account/orders").backgroundColor).toBe("account");
  expect(resolveSurfaceDesign(design, "/track").backgroundColor).toBe("tracking");
  expect(resolveSurfaceDesign(design, "/unknown").backgroundColor).toBe("missing");
  expect(resolveSurfaceDesign(design, "/").backgroundColor).toBe("root");
});

it("retains product-only controls over catalog defaults on the product renderer", () => {
  const d = { regions: { productDescriptionSize: 12 },
    storefront: { productAlignment: "left", regions: { productDescriptionSize: 18, catalogStockVisible: false } },
    productPage: { productAlignment: "right", regions: { productDescriptionSize: 30 } } };
  expect(resolveProductDesign(resolveSurfaceDesign(d, "/books/example"))).toMatchObject({
    productAlignment: "right", regions: { productDescriptionSize: 30, catalogStockVisible: false } });
});

it('keeps shared Studio categories ahead of stale page-specific category snapshots', () => {
 const categories = [{ id: 'books', name: 'Books' }];
 const design = { categories, storefront: { categories: [] }, collectionPage: { categories: ['Old'] } };
 expect(resolveSurfaceDesign(design, '/collections/books').categories).toBe(categories);
 expect(resolveMainDesign(design, true, true).categories).toBe(categories);
});
