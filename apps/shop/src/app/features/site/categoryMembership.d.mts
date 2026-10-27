// Types for categoryMembership.mjs (plain JS so build-time SEO scripts can import it too).
/** A category as stored in settings: a plain name (older shops) or an object with an id. */
export type CategoryLike = string | { id?: string; name?: string; aliases?: string[]; parentId?: string | null; [key: string]: any } | null | undefined;
/** A category after `normalizeCategories`: always an object with a stable id. */
export type NormalizedCategory = { id: string; name?: string; description?: string; showInNav?: boolean; aliases?: string[]; parentId?: string | null; [key: string]: any };
export type CategorizedBook = { categories?: string[]; genres?: string[]; [key: string]: any } | null | undefined;

export function catName(cat: CategoryLike): string;
export function categoryNames(cat: CategoryLike): string[];
export function normalizeCategories(cats: readonly CategoryLike[] | null | undefined): NormalizedCategory[];
export function parentOf(cat: CategoryLike, cats: readonly CategoryLike[] | null | undefined): string | null;
export function childCategories(cat: CategoryLike, cats: readonly CategoryLike[] | null | undefined): NormalizedCategory[];
export function bookInCategory(book: CategorizedBook, cat: CategoryLike, allCats?: readonly CategoryLike[] | null): boolean;
