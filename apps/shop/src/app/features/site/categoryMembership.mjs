// Shared by storefront navigation and build-time SEO. Keep membership identical.
export const catName = (cat) => (typeof cat === "string" ? cat : cat?.name || "");

/** Names a category answers to: its current name plus anything it was renamed from. */
export function categoryNames(cat) {
  if (typeof cat === "string") return [cat];
  return [cat?.name, ...(Array.isArray(cat?.aliases) ? cat.aliases : [])].filter(Boolean);
}

const catId = (cat, index) => (typeof cat === "object" && cat?.id) || `cat-${index}`;

/** Category objects with stable ids (plain-string categories get `cat-<index>`, as everywhere else). */
export function normalizeCategories(cats) {
  return (cats || []).map((c, i) => (typeof c === "string" ? { id: `cat-${i}`, name: c, description: "", showInNav: true } : { ...c, id: catId(c, i) }));
}

/** The parent id of a category, only when that parent exists and is itself top-level (one level deep). */
export function parentOf(cat, cats) {
  const list = normalizeCategories(cats);
  const rawParent = (c) => {
    const pid = typeof c === "object" ? c?.parentId : null;
    return pid && pid !== c?.id ? list.find((p) => p.id === pid) || null : null;
  };
  const parent = rawParent(cat);
  // A parent that itself points at an existing category isn't top-level (this also breaks cycles).
  return parent && !rawParent(parent) ? parent.id : null;
}

/** Sub-categories of `cat` (in list order). */
export function childCategories(cat, cats) {
  const id = typeof cat === "object" ? cat?.id : null;
  if (!id) return [];
  return normalizeCategories(cats).filter((c) => c.parentId === id && parentOf(c, cats) === id);
}

/**
 * True when a book is filed under the category by its current name or an earlier one.
 * Pass the full category list so a parent also matches books filed under its sub-categories.
 */
export function bookInCategory(book, cat, allCats = []) {
  const names = categoryNames(cat);
  if (names.includes("PUBLICATIONS")) return true;
  const tags = [...(book?.categories || []), ...(book?.genres || [])];
  if (tags.some((t) => names.includes(t))) return true;
  return childCategories(cat, allCats).some((c) => bookInCategory(book, c));
}

