// Shop categories + in-menu pages form one ordered "header bar". `design.navOrder`
// is a list of keys ("cat:<id>" / "page:<id>") that the Studio › Menus panel edits.
// Anything not listed (a newly added page or category) is appended in default order.

// A category may sit under another one (`parentId` = the parent's id), e.g. BOOKS and ZINES
// under PUBLICATIONS. Sub-categories don't get their own spot in the bar: their parent
// becomes a drop-down listing them (Studio › Menus › Shop categories › "Sits under").

export type NavItem =
  | { kind: "category"; key: string; label: string; category: any; children: any[] }
  | { kind: "page"; key: string; label: string; page: any };

export const catKey = (cat: any, index: number) => `cat:${(typeof cat === "object" && cat?.id) || `cat-${index}`}`;
export const pageKey = (page: any) => `page:${page.id || page.slug}`;

import { catName, categoryNames, normalizeCategories, parentOf, childCategories, bookInCategory } from "./categoryMembership.mjs";
export { catName, categoryNames, normalizeCategories, parentOf, childCategories, bookInCategory };
const catId = (cat: any, index: number) => (typeof cat === "object" && cat?.id) || `cat-${index}`;

/** Rename a category, remembering the old name so books tagged with it still match. */
export function renameCategory(cats: any[], index: number, nextName: string): any[] {
  return cats.map((c, i) => {
    if (i !== index) return c;
    const cur = typeof c === "string" ? { id: `cat-${i}`, name: c, description: "", showInNav: true } : c;
    const name = nextName.trim();
    if (!name || name === cur.name) return cur;
    const aliases = Array.from(new Set([...(cur.aliases || []), cur.name])).filter((a) => a && a !== name);
    return { ...cur, name, aliases };
  });
}

export function buildNavItems(categories: any[], pages: any[], order?: string[]): NavItem[] {
  const items: NavItem[] = [];
  (categories || []).forEach((c, i) => {
    if (typeof c === "object" && c?.showInNav === false) return;
    if (parentOf(c, categories)) return;
    const children = childCategories(typeof c === "string" ? { id: `cat-${i}` } : { ...c, id: catId(c, i) }, categories)
      .filter((k) => k.showInNav !== false);
    items.push({ kind: "category", key: catKey(c, i), label: catName(c), category: c, children });
  });
  [...(pages || [])]
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .filter((p) => p?.showInNav && p.status === "published")
    .forEach((p) => items.push({ kind: "page", key: pageKey(p), label: p.title, page: p }));
  if (!Array.isArray(order) || order.length === 0) return items;
  const rank = (k: string) => {
    const at = order.indexOf(k);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  // Array.prototype.sort is stable, so unlisted items keep their default order.
  return [...items].sort((a, b) => rank(a.key) - rank(b.key));
}

/** navOrder that keeps categories where they are and puts pages, in their own slots, in `orderedPages` order. */
export function reslotPages(items: NavItem[], orderedPages: any[]): string[] {
  const pageKeys = orderedPages.map((p) => pageKey(p)).filter((k) => items.some((i) => i.key === k));
  let n = 0;
  return items.map((i) => (i.kind === "page" ? pageKeys[n++] ?? i.key : i.key));
}

/** New navOrder after moving the item at `index` by `delta` within the visible list. */
export function moveNavItem(items: NavItem[], index: number, delta: number): string[] {
  const j = index + delta;
  const keys = items.map((i) => i.key);
  if (j < 0 || j >= keys.length) return keys;
  [keys[index], keys[j]] = [keys[j], keys[index]];
  return keys;
}

/** Publisher information gets its own row; an explicit Studio list overrides the initial grouping. */
export function splitNavigation(items: NavItem[], design: any): { primary: NavItem[]; secondary: NavItem[] } {
  const configured = Array.isArray(design?.secondaryNavKeys) ? design.secondaryNavKeys : null;
  const isSecondary = (item: NavItem) => item.kind === "page" && (configured
    ? configured.includes(item.key)
    : (/^(?:project\s+)?submissions?\b|^(?:our\s+)?history\b|^open[ -]calls?\b/i.test(item.label.trim()) || /^(?:submissions?|history(?:-of-.+)?|open-call)(?:$|-)/i.test(item.page?.slug || "")));
  return { primary: items.filter(item => !isSecondary(item)), secondary: items.filter(isSecondary) };
}

/** The default ("Reference") shop header: every layout except Studio › Catalog layout (advanced) › Layout = Modern. */
export const usesReferenceHeader = (design: any) => design?.catalogLayoutStyle !== "modern";

/** How many categories the Reference header's bar shows — Catalog layout (advanced) › "Max categories in the nav". */
export const referenceCategoryLimit = (design: any) => Math.max(1, Math.min(12, Number(design?.referenceCategoryLimit ?? 1) || 1));

/**
 * Top-level, visible categories the Reference header's bar shows (first N in Shop categories order). Shared by
 * StoreHeader and Studio › Menus › Shop categories, so the menu manager can say which categories are left out.
 */
export function referenceNavCategories(categories: any[], design: any): any[] {
  return categories.filter((c: any) => c.showInNav !== false && !parentOf(c, categories)).slice(0, referenceCategoryLimit(design));
}
