import { describe, expect, it } from "vitest";
import live from "./__fixtures__/liveDesign.json";
import { compactDesign, isSurfaceKey, pageOverrides, ROOT_ONLY_KEYS, writeDesignValue } from "./designModel";
import { resolveMainDesign, resolveProductDesign, resolveSurfaceDesign } from "./surfaceDesign";

// "What you see in Studio is what goes live": every storefront route resolves its design through
// designModel. This checks it against the real published design.
const design = (live as any).design;
const customPages = Object.keys(design).filter(k => k.startsWith("page:")).map(k => `/page/${k.slice(5)}`);
const routes: Record<string, (d: any) => any> = {
  home: d => resolveMainDesign(d, false, false),
  catalog: d => resolveMainDesign(d, true, false),
  collection: d => resolveMainDesign(d, true, true),
  product: d => resolveProductDesign(resolveSurfaceDesign(d, "/books/example")),
  checkout: d => resolveSurfaceDesign(d, "/checkout"),
  wishlist: d => resolveSurfaceDesign(d, "/wishlist"),
  account: d => resolveSurfaceDesign(d, "/account"),
  tracking: d => resolveSurfaceDesign(d, "/track"),
  missing: d => resolveSurfaceDesign(d, "/no-such-page"),
  unknownPage: d => resolveSurfaceDesign(d, "/page/not-a-page"),
  ...Object.fromEntries(customPages.map(path => [path, (d: any) => resolveSurfaceDesign(d, path)])),
};

/** What renderers read: every non-surface value, plus each template's sections and colour schemes. */
function projection(resolved: any) {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (!isSurfaceKey(key)) out[key] = value;
    else out[key] = { sections: (value as any)?.sections ?? null, colorSchemes: (value as any)?.colorSchemes ?? resolved.colorSchemes ?? null, hidePageBody: (value as any)?.hidePageBody ?? null };
  }
  return JSON.parse(JSON.stringify(out));
}

const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v;
const stable = (v: any) => JSON.stringify(sortKeys(v ?? null));

/** The resolver the shop used before Studio 2.0 (surface objects replaced root values wholesale). */
function legacyResolve(route: string, d: any) {
  const surface = (base: any, ...layers: any[]) => {
    const out = Object.assign({}, base, ...layers.filter(Boolean));
    out.regions = Object.assign({}, base?.regions, ...layers.map(l => l?.regions));
    return out;
  };
  if (route === "home") return { ...surface(d, d.heroPage), categories: d.categories };
  if (route === "catalog") return { ...surface(d, d.storefront), categories: d.categories };
  if (route === "collection") return { ...surface(d, d.storefront, d.collectionPage), categories: d.categories };
  if (route === "product") { const s = { ...surface(d, d.productPage), categories: d.categories }; return surface(s, s.storefront, s.productPage); }
  const id = route === "checkout" ? "cartPage" : route === "wishlist" ? "wishlistPage" : route === "account" ? "accountPage" : route === "tracking" ? "trackingPage" : route === "missing" ? "page404" : "page";
  const custom = route.startsWith("/page/") ? d[`page:${route.slice(6)}`] : null;
  return { ...surface(d, d[id], custom), categories: d.categories };
}

describe("design value model on the published design", () => {
  it("tidying duplicate page values changes nothing on any page", () => {
    const { design: compacted, report } = compactDesign(design);
    expect(report.duplicates).toBeGreaterThan(100);
    for (const [route, resolve] of Object.entries(routes)) {
      expect(projection(resolve(compacted)), route).toEqual(projection(resolve(design)));
    }
    // and it really is smaller
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(design).length);
  });

  it("differs from the old shop resolver only where the shop disagreed with Studio", () => {
    const allowed = new Set([...ROOT_ONLY_KEYS, "copy"]);
    const changed = new Set<string>();
    for (const [route, resolve] of Object.entries(routes)) {
      const now = projection(resolve(design)), before = projection(legacyResolve(route, design));
      for (const key of new Set([...Object.keys(now), ...Object.keys(before)])) {
        if (isSurfaceKey(key)) continue;
        if (stable(now[key]) !== stable(before[key])) changed.add(key);
      }
    }
    expect([...changed].filter(k => !allowed.has(k))).toEqual([]);
    expect([...changed].sort()).toEqual(["categories", "copy", "globalSections", "navOrder"]);
    // The stale catalog-only sample section and stale page copies of the categories are gone…
    expect(routes.catalog(design).globalSections ?? []).toEqual(design.globalSections ?? []);
    expect(routes.product(design).categories).toEqual(design.categories);
    // …and the owner's footer wordmark now shows on every page.
    for (const path of customPages) expect(routes[path](design).copy?.footerWordmark).toBe(design.copy?.footerWordmark);
  });

  it("keeps genuine page overrides and lists them for review", () => {
    const overrides = pageOverrides(design, "storefront").map(o => o.key);
    expect(overrides).toContain("catalogGridGap");
    expect(routes.catalog(compactDesign(design).design).catalogGridGap).toBe(design.storefront.catalogGridGap);
  });

  it("an All pages edit shows on every page, a page edit only on that page", () => {
    const all = writeDesignValue(design, "catalogGridGap", 7);
    for (const resolve of Object.values(routes)) expect(resolve(all).catalogGridGap).toBe(7);
    const local = writeDesignValue(design, "catalogGridGap", 9, { surface: "storefront" });
    expect(routes.catalog(local).catalogGridGap).toBe(9);
    expect(routes.checkout(local).catalogGridGap).toBe(design.catalogGridGap);
  });
});
