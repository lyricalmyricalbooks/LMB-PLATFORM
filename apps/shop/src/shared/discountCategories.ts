// One copy for the shop and the server (functions/shared/discountCategories.js is generated from
// this file): a category discount covers the books the storefront shows in that category — its
// earlier names (aliases), its sub-categories, and every book for PUBLICATIONS. The server's
// result is authoritative; checkout uses this only to show the same saving.
const ALL_BOOKS = "PUBLICATIONS";

function normalizeCategories(cats: any): any[] {
  return (Array.isArray(cats) ? cats : []).map((c: any, i: number) => (typeof c === "string"
    ? { id: `cat-${i}`, name: c, aliases: [] }
    : { ...(c || {}), id: (c && c.id) || `cat-${i}` }));
}

const namesOf = (cat: any): string[] => [cat.name, ...(Array.isArray(cat.aliases) ? cat.aliases : [])].filter((n: any) => typeof n === "string" && n);

function parentFinder(cats: any[]) {
  const byId = new Map(cats.map(c => [c.id, c]));
  // A parent counts only when it exists and is itself top-level (breaks cycles, one level deep).
  const rawParent = (c: any) => (c.parentId && c.parentId !== c.id ? byId.get(c.parentId) || null : null);
  return (c: any) => { const p = rawParent(c); return p && !rawParent(p) ? p : null; };
}

export function expandDiscountCategories<T>(discount: T, shopCategories: any): T {
  const d: any = discount;
  if (!d || d.appliesTo !== "categories") return discount;
  const selected: string[] = (Array.isArray(d.selectedCategories) ? d.selectedCategories : []).filter((n: any) => typeof n === "string");
  if (selected.includes(ALL_BOOKS)) return { ...d, appliesTo: "all", selectedCategories: [] };
  const cats = normalizeCategories(shopCategories);
  const parentOf = parentFinder(cats);
  const names = new Set(selected);
  for (const cat of cats) {
    const own = namesOf(cat);
    if (!own.some(n => selected.includes(n))) continue;
    if (own.includes(ALL_BOOKS)) return { ...d, appliesTo: "all", selectedCategories: [] };
    own.forEach(n => names.add(n));
    for (const child of cats) if (parentOf(child) === cat) namesOf(child).forEach(n => names.add(n));
  }
  return names.size === selected.length ? discount : { ...d, selectedCategories: [...names] };
}

export type DiscountCategoryChoice = { name: string; parent?: string; renamedTo?: string; missing?: boolean };

/**
 * Admin › Discounts category picker: every shop category (each sub-category right after its parent),
 * then any name saved on the code that isn't a current category name — an old name of a renamed
 * category (still matches its books) or one that no longer exists, so the owner can untick it.
 */
export function discountCategoryChoices(shopCategories: any, saved: string[] = []): DiscountCategoryChoice[] {
  const cats = normalizeCategories(shopCategories).filter(c => typeof c.name === "string" && c.name);
  const parentOf = parentFinder(cats);
  const out: DiscountCategoryChoice[] = [];
  for (const cat of cats) {
    if (parentOf(cat)) continue;
    out.push({ name: cat.name });
    for (const child of cats) if (parentOf(child) === cat) out.push({ name: child.name, parent: cat.name });
  }
  for (const name of saved || []) {
    if (!name || out.some(o => o.name === name)) continue;
    const renamed = cats.find(c => namesOf(c).includes(name));
    out.push(renamed ? { name, renamedTo: renamed.name } : { name, missing: true });
  }
  return out;
}
