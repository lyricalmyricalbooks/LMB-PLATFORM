import { buildNavItems, categoryNames, normalizeCategories } from "../../features/site/navItems";

export type CategoryAction = "add" | "remove" | "move";
const tags = (value: any): string[] => Array.isArray(value) ? value.filter(v => typeof v === "string") : [];

// Direct assignments deliberately exclude the storefront's automatic all-books
// category and parent roll-ups. Never strip a child's tags when deleting a parent.
export function directlyAssigned(book: any, category: any): boolean {
  const names = categoryNames(category);
  return [...tags(book.categories), ...tags(book.genres)].some(tag => names.includes(tag));
}

export function categoryBookPatch(book: any, source: any, action: CategoryAction, target?: any) {
  const names = categoryNames(source);
  let categories = tags(book.categories), genres = tags(book.genres);
  if (action !== "add") {
    categories = categories.filter(tag => !names.includes(tag));
    genres = genres.filter(tag => !names.includes(tag));
  }
  const destination = action === "add" ? source : action === "move" ? target : null;
  if (destination && !directlyAssigned({ categories, genres }, destination)) categories = [...categories, destination.name];
  return { categories, genres };
}

export function deleteCategory(categories: any[], id: string): any[] {
  return categories.filter(c => c.id !== id).map(c => c.parentId === id ? { ...c, parentId: null } : c);
}

export function validateCategoryName(categories: any[], id: string, name: string): string {
  if (!name.trim()) return "Enter a category name.";
  const key = name.trim().toLowerCase();
  if (categories.some(c => c.id !== id && categoryNames(c).some(n => n.toLowerCase() === key)))
    return "That name is already used by another category or an earlier name.";
  return "";
}

export function categoryNavOrder(before: any[], after: any[], pages: any[], order?: string[]): string[] {
  const keys = buildNavItems(after, pages).filter(item => item.kind === "category").map(item => item.key);
  let index = 0;
  return buildNavItems(before, pages, order).map(item => item.kind === "category" ? keys[index++] : item.key);
}

/**
 * Adds one category to a stored list (live or draft) without touching the others.
 * A list that never had categories starts from the shop defaults; an existing name is left alone.
 */
export function appendCategory(stored: any[] | undefined, category: any, defaults: readonly any[]): any[] {
  const list = normalizeCategories(Array.isArray(stored) ? stored : [...defaults]);
  const name = String(category?.name || "").trim().toLocaleLowerCase();
  if (!name || list.some(c => String(c?.name || "").trim().toLocaleLowerCase() === name)) return list;
  return [...list, category];
}
