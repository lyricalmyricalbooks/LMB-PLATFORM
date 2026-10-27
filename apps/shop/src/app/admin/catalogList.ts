// Books catalog list: what each row shows (status, author, stock, price) and the filters/sorts built on
// the same values. Pure; BookCatalog.tsx renders it. Stock and price follow the storefront/server rules:
// - price: features/site/displayPrice.ts (editions → cheapest edition, sale only while it is on);
// - stock: functions/index.js — untracked books never run out, book-level backorders sell past 0,
//   box sets take stock from the books inside (promotions.bundleAvailable), gift cards have none.
import { releaseArrived } from "../features/site/liveBook";
import { preorderActive } from "../features/site/preorder";
import { bundleAvailable, isBundle, isGiftCardProduct } from "../features/site/promotions";
import { displayPrice, editionPrices, showsSale } from "../features/site/displayPrice";
import type { BadgeTone } from "./riso/components";

/** One low-stock threshold for the catalog list and the book editor. */
export const LOW_STOCK = 5;

export type PublicationState = "published" | "draft" | "scheduled" | "archived";
export const STATUS_FILTERS = ["All", "Published", "Draft", "Scheduled", "Archived"] as const;
export type StatusFilter = typeof STATUS_FILTERS[number];

export function publicationState(book: any, nowISO = new Date().toISOString()): PublicationState {
  if (book?.status === "archived") return "archived";
  if (book?.status === "draft") return "draft";
  // Same Toronto-day rule as the storefront and checkout (liveBook.ts releaseArrived).
  if (book?.scheduleDate && !releaseArrived(book.scheduleDate, nowISO)) return "scheduled";
  return "published";
}

const STATE_BADGE: Record<PublicationState, { tone: BadgeTone; text: string }> = {
  published: { tone: "success", text: "Published" },
  draft: { tone: "neutral", text: "Draft" },
  scheduled: { tone: "info", text: "Scheduled" },
  archived: { tone: "neutral", text: "Archived" },
};
export const publicationBadge = (book: any, nowISO?: string) => STATE_BADGE[publicationState(book, nowISO)];

export function matchesStatus(book: any, filter: string, nowISO?: string): boolean {
  if (filter === "All") return true;
  if (filter === "Pre-order") return preorderActive(book);
  if (filter === "Coming soon") return book?.comingSoon === true;
  return publicationState(book, nowISO) === filter.toLowerCase();
}

/** The credit shown under a title: the editor's "Author / contributors" (subtitle), else legacy authorName, else the linked author. */
export function bookAuthor(book: any, authorsById?: Map<string, string> | Record<string, string>): string {
  const linked = book?.authorId
    ? (authorsById instanceof Map ? authorsById.get(book.authorId) : authorsById?.[book.authorId]) || ""
    : "";
  return String(book?.subtitle || book?.authorName || linked || "").trim();
}

// ── Stock ────────────────────────────────────────────────────────

export type StockKind = "giftcard" | "untracked" | "backorder" | "soldout" | "low" | "instock";
export const STOCK_FILTERS = ["All", "In stock", "Low", "Sold out", "Not tracked"] as const;

export interface StockInfo {
  kind: StockKind;
  /** Copies (or box sets) on hand; Infinity when nothing limits sales. */
  count: number;
  tone: BadgeTone;
  text: string;
  /** For sorting "Stock: low to high": unlimited sorts last. */
  sortValue: number;
}

// Same field order as the server (functions/inventory.js): an edition's stockLevel, else stock.
const variantStock = (v: any) => Math.max(0, Number(v?.stockLevel ?? v?.stock) || 0);

export function stockInfo(book: any, getBook: (id: string) => any = () => undefined): StockInfo {
  if (isGiftCardProduct(book)) return { kind: "giftcard", count: Infinity, tone: "neutral", text: "Gift card · no stock", sortValue: Infinity };
  if (isBundle(book)) {
    const sets = bundleAvailable(book, getBook);
    if (sets === Infinity) return { kind: "untracked", count: Infinity, tone: "neutral", text: "Box set · not tracked", sortValue: Infinity };
    return level(sets, " set", true);
  }
  if (!book?.trackInventory) return { kind: "untracked", count: Infinity, tone: "neutral", text: "Not tracked", sortValue: Infinity };
  const variants = Array.isArray(book.variants) ? book.variants : [];
  const count = variants.length ? variants.reduce((sum: number, v: any) => sum + variantStock(v), 0) : Math.max(0, Number(book.stockLevel) || 0);
  if (book.allowBackorder) return { kind: "backorder", count, tone: "info", text: `Backorder · ${count} on hand`, sortValue: Infinity };
  return level(count, variants.length ? " (all editions)" : "", false);
}

function level(n: number, suffix: string, sets: boolean): StockInfo {
  const what = sets ? ` set${n === 1 ? "" : "s"}` : "";
  if (n <= 0) return { kind: "soldout", count: 0, tone: "danger", text: "Sold out", sortValue: 0 };
  if (n <= LOW_STOCK) return { kind: "low", count: n, tone: "warning", text: `${n}${what} left${suffix}`, sortValue: n };
  return { kind: "instock", count: n, tone: "success", text: `${n}${what} in stock${suffix}`, sortValue: n };
}

export function matchesStock(info: StockInfo, filter: string): boolean {
  switch (filter) {
    case "In stock": return info.kind === "instock" || info.kind === "low" || info.kind === "backorder";
    case "Low": return info.kind === "low";
    case "Sold out": return info.kind === "soldout";
    case "Not tracked": return info.kind === "untracked" || info.kind === "giftcard";
    default: return true;
  }
}

// ── Price ────────────────────────────────────────────────────────

export interface PriceInfo {
  /** What a shopper is charged today (CAD); the sort value. */
  price: number;
  /** Struck-through regular price while a sale is on. */
  was?: number;
  text: string;
}

const cad = (n: number) => `CA$${n.toFixed(2)}`;

export function priceInfo(book: any, now: Date = new Date()): PriceInfo {
  const price = displayPrice(book, false, now);
  const editions = editionPrices(book);
  if (isGiftCardProduct(book)) {
    const amounts = editions.filter(n => n > 0);
    if (!amounts.length) return { price: 0, text: "No amounts" };
    const lo = Math.min(...amounts), hi = Math.max(...amounts);
    return { price: lo, text: lo === hi ? cad(lo) : `${cad(lo)}–${cad(hi)}` };
  }
  if (editions.length > 1 && new Set(editions).size > 1) return { price, text: `from ${cad(price)}` };
  if (showsSale(book, now)) return { price, was: Number(book.retailPrice) || 0, text: cad(price) };
  return { price, text: cad(price) };
}

/** Price and stock can be edited in the table only for plain books (editions, gift cards and box sets use the editor). */
export const inlineEditable = (book: any) =>
  !isGiftCardProduct(book) && !isBundle(book) && !(Array.isArray(book?.variants) && book.variants.length);

// ── Duplicate / delete ───────────────────────────────────────────

/**
 * The copy Duplicate creates: everything describing the book, but nothing that identifies the original
 * or would sell it twice — no ISBN/SKU/barcode, slug, stock, featured flag or digital file; a draft.
 */
export function duplicateBookData(data: any, nowISO = new Date().toISOString()): any {
  const copy: any = { ...data };
  delete copy.id;
  delete copy._lastDoc;
  for (const key of ["isbn", "isbn13", "sku", "barcode", "slug", "digitalFileUrl", "digitalFilePath", "digitalFileName"]) copy[key] = "";
  copy.title = `${data?.title || "Untitled"} (Copy)`;
  copy.stockLevel = 0;
  copy.isFeatured = false;
  copy.featured = false;
  copy.status = "draft";
  if (Array.isArray(data?.variants)) {
    copy.variants = data.variants.map((v: any) => ({ ...v, id: newId(), sku: "", stock: 0, stockLevel: 0 }));
  }
  copy.createdAt = nowISO;
  copy.updatedAt = nowISO;
  return copy;
}

const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/** Books outside `ids` that point at one of them (box-set parts or curated recommendations). */
export function bookReferences(ids: string[], books: any[]): { id: string; title: string; usedBy: string[] }[] {
  const doomed = new Set(ids);
  const out: { id: string; title: string; usedBy: string[] }[] = [];
  for (const id of ids) {
    const usedBy = books
      .filter(b => !doomed.has(b.id) && (
        (Array.isArray(b.bundleItems) && b.bundleItems.some((p: any) => p?.bookId === id))
        || (Array.isArray(b.relatedBookIds) && b.relatedBookIds.includes(id))))
      .map(b => b.title || "Untitled");
    if (usedBy.length) out.push({ id, title: books.find(b => b.id === id)?.title || "Untitled", usedBy });
  }
  return out;
}

/** Published listings whose ISBN another published book also uses (Google merges or rejects them). */
export function sharedIsbns(books: any[]): { isbn: string; titles: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const b of books) {
    if (publicationState(b) === "draft" || publicationState(b) === "archived") continue;
    const key = String(b?.isbn || "").toUpperCase().replace(/[^0-9X]/g, "");
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), b.title || "Untitled"]);
  }
  return [...groups].filter(([, titles]) => titles.length > 1).map(([isbn, titles]) => ({ isbn, titles }));
}
