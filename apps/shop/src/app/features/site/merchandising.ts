import type { Book } from "./types";
import { displayPrice, showsSale } from "./displayPrice";
import { preorderActive } from "./preorder";
import { bookInCategory, categoryNames, normalizeCategories } from "./categoryMembership.mjs";
import { bookSlug } from "./staffNotes";
import { inShopOrder } from "./shopOrder";

/** Saved selections are intentional: an empty array means no recommendations. */
export function recommendedBooks(book: any, catalog: Book[], limit = 4): Book[] {
  const eligible = (candidate: Book) => candidate.id !== book?.id && candidate.status === "published";
  const published = catalog.filter(eligible);
  if (Array.isArray(book?.relatedBookIds)) {
    return [...new Set<string>(book.relatedBookIds)].flatMap(id => {
      const found = published.find(b => b.id === id);
      return found ? [found] : [];
    }).slice(0, limit);
  }
  const categories = book?.categories || book?.genres || [];
  const same = published.filter(b => ((b as any).categories || (b as any).genres || []).some((c: string) => categories.includes(c)));
  return [...same, ...published.filter(b => !same.includes(b))].slice(0, limit);
}
export function editionFacts(book: any): { key: string; value: string }[] {
  return [
    { key: "specEdition", value: book?.edition },
    { key: "specPages", value: Number(book?.pageCount) > 0 ? String(book.pageCount) : undefined },
    { key: "specPublisher", value: book?.publisher },
    { key: "specPublished", value: book?.publishDate },
  ].flatMap(row => typeof row.value === "string" && row.value.trim().length > 0 ? [{ key: row.key, value: row.value }] : []);
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog sources — which books a catalog section shows (Studio › section › Content ›
// "Which books"). One rule for every catalog section (Product grid, Product showcase grid,
// Cover carousel, Featured product), so the preview and the shop always agree.
//
// Saved designs keep their meaning: no `productSource` = "all", "manual" still reads the
// comma-separated `manualSlugs` text, and without a `productSort` books keep shop order.
// Display only — prices, stock and what checkout charges are untouched.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOK_SOURCES = ["all", "featured", "manual", "category", "newest", "onSale", "preorder"] as const;
export type BookSource = (typeof BOOK_SOURCES)[number];
export const BOOK_SORTS = ["", "picked", "newest", "title", "priceLow", "priceHigh"] as const;
export type BookSort = (typeof BOOK_SORTS)[number];

export type BookQuery = {
  /** Unknown or missing values mean "all", exactly as before sources existed. */
  source?: string;
  /** Picked books: storefront slugs, as an array or the saved comma-separated text. */
  manual?: string[] | string;
  /** Shop category name for source "category" (its sub-categories count too). */
  category?: string;
  /** The shop's categories (design.categories), for parent → sub-category membership. */
  categories?: any[];
  /** "" keeps shop order ("newest" source defaults to newest first). */
  sort?: string;
  limit?: number;
};

/** "a, b ,c" → ["a", "b", "c"]; arrays pass through trimmed. Blank entries are dropped. */
export function parseSlugList(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(",");
  return parts.map((s) => String(s ?? "").trim()).filter(Boolean);
}

/** The text a Studio books picker saves: the same comma-separated form typed by hand before. */
export const joinSlugList = (slugs: string[]): string => parseSlugList(slugs).join(", ");

const isFeatured = (book: any) => (book?.isFeatured ?? book?.featured) === true;

/** When a book arrived, for "Newest": publication date, then release date, then when it was added. */
export function bookDateMs(book: any): number {
  for (const value of [book?.publishDate, book?.scheduleDate, book?.createdAt]) {
    if (!value) continue;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") { const at = Date.parse(value); if (Number.isFinite(at)) return at; continue; }
    if (typeof value?.toMillis === "function") { const at = Number(value.toMillis()); if (Number.isFinite(at)) return at; continue; }
    if (typeof value?.seconds === "number") return value.seconds * 1000;
  }
  return 0;
}

function inCategory(book: any, name: string, categories: any[] = []): boolean {
  const all = normalizeCategories(categories);
  const cat = all.find((c: any) => categoryNames(c).includes(name));
  return bookInCategory(book, cat || name, all);
}

/**
 * Where a book sits in a picked list: by its storefront slug (what older designs and the pickers save)
 * or by its immutable id (what the picker saves when two books share a slug).
 */
export function pickedIndex(picked: string[], book: any): number {
  const bySlug = picked.indexOf(bookSlug(book) || "");
  return bySlug !== -1 ? bySlug : book?.id ? picked.indexOf(String(book.id)) : -1;
}

function sortBooks(list: any[], sort: string, manual: string[]): any[] {
  const indexed = list.map((book, index) => ({ book, index }));
  const by = (score: (b: any) => number | string, direction = 1) => (a: any, b: any) => {
    const x = score(a.book), y = score(b.book);
    return (x < y ? -1 : x > y ? 1 : 0) * direction || a.index - b.index;
  };
  if (sort === "picked") {
    const rank = (b: any) => { const at = pickedIndex(manual, b); return at === -1 ? Number.MAX_SAFE_INTEGER : at; };
    indexed.sort(by(rank));
  } else if (sort === "newest") indexed.sort(by(bookDateMs, -1));
  else if (sort === "title") indexed.sort(by((b) => String(b?.title || "").toLocaleLowerCase()));
  else if (sort === "priceLow") indexed.sort(by((b) => displayPrice(b)));
  else if (sort === "priceHigh") indexed.sort(by((b) => displayPrice(b), -1));
  else return inShopOrder(list);
  return indexed.map((x) => x.book);
}

/**
 * The books a catalog section shows, in order. `books` is what the page already shows shoppers
 * (live books only, outside the Studio preview), so a source never reveals a draft.
 */
export function selectBooks<T = any>(books: T[] | null | undefined, query: BookQuery = {}): T[] {
  const list = (books || []) as any[];
  const source: BookSource = (BOOK_SOURCES as readonly string[]).includes(String(query.source)) ? (query.source as BookSource) : "all";
  const manual = parseSlugList(query.manual);
  const category = String(query.category || "").trim();
  const chosen = list.filter((book) => {
    if (source === "featured") return isFeatured(book);
    if (source === "manual") return pickedIndex(manual, book) !== -1;
    // No category chosen yet: show the whole shop rather than an empty section.
    if (source === "category") return !category || inCategory(book, category, query.categories);
    if (source === "onSale") return showsSale(book);
    if (source === "preorder") return preorderActive(book);
    return true;
  });
  const sort = String(query.sort || (source === "newest" ? "newest" : ""));
  const ordered = sortBooks(chosen, sort, manual);
  const limit = Number(query.limit);
  return (query.limit != null && Number.isFinite(limit) ? ordered.slice(0, Math.max(0, limit)) : ordered) as T[];
}

/** A catalog section's saved settings as a query (`productSource`, `manualSlugs`, `productCategory`, `productSort`). */
export function sectionBookQuery(settings: any, categories?: any[]): BookQuery {
  return {
    source: settings?.productSource,
    manual: settings?.manualSlugs,
    category: settings?.productCategory,
    sort: settings?.productSort,
    categories,
  };
}

/** Featured product: the saved book id, else its slug (or an id the picker saved there), else the first book. */
export function pickBook<T = any>(books: T[] | null | undefined, settings: { productId?: string; productSlug?: string } = {}): T | undefined {
  const list = (books || []) as any[];
  return list.find((b) => b.id === settings.productId) || list.find((b) => b.slug === settings.productSlug)
    || (settings.productSlug ? list.find((b) => b.id === settings.productSlug) : undefined) || list[0];
}
