// How a page's design is put together, shared by the storefront, Studio and build-time SEO.
//
// A design has root ("all pages") values and page surfaces (`storefront`, `productPage`,
// `page:<slug>`…) that may override some of them. Before Studio 2.0 a surface object could
// shadow root values wholesale, so the shop sometimes showed a stale page copy while Studio
// showed the root value. Now:
//  - shop structure (menus, categories, global sections…) always comes from the root;
//  - `copy` and `regions` merge per entry (page entries win, the rest come from all pages);
//  - a surface never carries another surface inside it;
//  - "All pages" edits set the root and clear the matching page overrides.
import { designEqual } from "./designEqual";

/** Page surfaces that can carry their own overrides (custom pages add `page:<slug>`). */
export const STATIC_SURFACES = ["heroPage", "storefront", "productPage", "collectionPage", "cartPage", "page", "page404", "wishlistPage", "accountPage", "trackingPage"];
/** Alternate book/collection templates (Studio 2.8, features/site/templateAlternates.ts). */
const ALT_SURFACE = /^(productPage|collectionPage)~[a-z0-9][a-z0-9-]{0,39}$/;
export const isSurfaceKey = (key: string) => STATIC_SURFACES.includes(key) || key.startsWith("page:") || ALT_SURFACE.test(key);

/** Shop structure that is the same on every page — a page surface can never override it. */
export const ROOT_ONLY_KEYS = new Set(["menus", "categories", "navOrder", "secondaryNavKeys", "footerBadges", "sectionPresets", "sharedBlocks", "globalSections", "headerSections", "overlaySections", "alternateTemplates"]);
/** Maps whose entries merge one by one (page entry wins), instead of replacing the whole map. */
export const MERGED_MAPS = new Set(["copy", "regions"]);

const plain = (v: any): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Lay page surfaces over a base design, most specific last. */
export function layerDesign(base: any, ...surfaces: any[]) {
  const out: Record<string, any> = { ...(base || {}) };
  for (const surface of surfaces) {
    if (!plain(surface)) continue;
    for (const [key, value] of Object.entries(surface)) {
      if (ROOT_ONLY_KEYS.has(key) || isSurfaceKey(key)) continue;
      out[key] = MERGED_MAPS.has(key) && plain(value) ? { ...(plain(out[key]) ? out[key] : {}), ...(value as any) } : value;
    }
  }
  return out;
}

/** The surfaces a page inherits from, most general first (root is implied). */
export function surfaceChain(surface: string): string[] {
  if (ALT_SURFACE.test(surface)) return ["storefront", surface.split("~")[0], surface];
  if (surface === "productPage" || surface === "collectionPage") return ["storefront", surface];
  if (surface.startsWith("page:")) return ["page", surface];
  return [surface];
}

const same = (a: any, b: any) => designEqual(a, b);

/** The value a surface would show for `key` if it had no override of its own. */
export function inheritedValue(design: any, surface: string, key: string) {
  const parents = surfaceChain(surface).slice(0, -1).map(id => design?.[id]);
  return layerDesign(design, ...parents)[key];
}

export type CompactionReport = {
  /** Page values identical to what the page inherits anyway (removed, nothing visible changes). */
  duplicates: number;
  /** Surfaces nested inside other surfaces (never read; removed). */
  nested: string[];
  /** Page copies of shop structure that disagreed with the shop-wide value (removed; the shop-wide value applies). */
  structure: { surface: string; key: string }[];
};

/**
 * Remove page values that can never take effect or that equal the inherited value. Genuine page
 * overrides stay. The resolved design of every page is the same before and after.
 */
export function compactDesign(design: any): { design: any; report: CompactionReport } {
  const report: CompactionReport = { duplicates: 0, nested: [], structure: [] };
  if (!plain(design)) return { design, report };
  const next: Record<string, any> = { ...design };
  for (const surface of Object.keys(design).filter(isSurfaceKey)) {
    const obj = design[surface];
    if (!plain(obj)) continue;
    const parentDesign = layerDesign(design, ...surfaceChain(surface).slice(0, -1).map(id => design[id]));
    const kept: Record<string, any> = {};
    let dropped = false;
    for (const [key, value] of Object.entries(obj)) {
      if (isSurfaceKey(key)) { report.nested.push(`${surface}.${key}`); dropped = true; continue; }
      if (ROOT_ONLY_KEYS.has(key)) {
        if (!same(value, design[key])) report.structure.push({ surface, key });
        else report.duplicates++;
        dropped = true;
        continue;
      }
      if (MERGED_MAPS.has(key) && plain(value)) {
        const inherited = plain(parentDesign[key]) ? parentDesign[key] : {};
        const all = Object.entries(value);
        const entries = all.filter(([leaf, v]) => {
          const dup = leaf in inherited && same(v, inherited[leaf]);
          if (dup) report.duplicates++;
          return !dup;
        });
        if (entries.length === all.length && entries.length) kept[key] = value;
        else { dropped = true; if (entries.length) kept[key] = Object.fromEntries(entries); }
        continue;
      }
      if (key !== "sections" && key in parentDesign && same(value, parentDesign[key])) { report.duplicates++; dropped = true; continue; }
      kept[key] = value;
    }
    // Nothing removed: keep the very same surface object (structural sharing between edits).
    next[surface] = dropped ? kept : obj;
  }
  return { design: next, report };
}

/** Values on one page surface that differ from what it would inherit ("this page only" overrides). */
export function pageOverrides(design: any, surface: string): { key: string; value: any; inherited: any }[] {
  const obj = design?.[surface];
  if (!plain(obj)) return [];
  const parentDesign = layerDesign(design, ...surfaceChain(surface).slice(0, -1).map(id => design[id]));
  const out: { key: string; value: any; inherited: any }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (key === "sections" || key === "hidePageBody" || key === "colorSchemes" || isSurfaceKey(key) || ROOT_ONLY_KEYS.has(key)) continue;
    if (MERGED_MAPS.has(key) && plain(value)) {
      for (const [leaf, v] of Object.entries(value)) if (!same(v, parentDesign[key]?.[leaf])) out.push({ key: `${key}.${leaf}`, value: v, inherited: parentDesign[key]?.[leaf] });
    } else if (!same(value, parentDesign[key])) out.push({ key, value, inherited: parentDesign[key] });
  }
  return out;
}

/**
 * Write a value. "all" sets the root and removes the matching override from every page, so the
 * value really shows everywhere; "page" sets it on one surface only.
 */
export function writeDesignValue(design: any, path: string, value: any, scope: "all" | { surface: string } = "all") {
  const [top, ...rest] = path.split(".");
  const leaf = rest.join(".");
  const setIn = (obj: any) => {
    const o = { ...(obj || {}) };
    if (leaf) {
      const map = { ...(plain(o[top]) ? o[top] : {}) };
      if (value === undefined || (value === "" && top !== "copy")) delete map[leaf]; else map[leaf] = value;
      if (Object.keys(map).length) o[top] = map; else delete o[top];
    } else if (value === undefined) delete o[top];
    else o[top] = value;
    return o;
  };
  const clearIn = (obj: any) => {
    if (!plain(obj) || !(top in obj)) return obj;
    const o = { ...obj };
    // copy/regions merge per entry, so only that entry goes; any other map on a page replaces
    // the shop-wide map as a whole, so the page's whole map goes.
    if (leaf && MERGED_MAPS.has(top) && plain(o[top])) {
      const map = { ...o[top] }; delete map[leaf];
      if (Object.keys(map).length) o[top] = map; else delete o[top];
    } else delete o[top];
    return o;
  };
  if (scope !== "all") return { ...design, [scope.surface]: setIn(design?.[scope.surface]) };
  const next: Record<string, any> = setIn(design);
  for (const key of Object.keys(next)) if (isSurfaceKey(key)) next[key] = clearIn(next[key]);
  return next;
}
