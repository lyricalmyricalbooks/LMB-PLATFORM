// Which copies of a catalog entry have a shelf count worth watching. Pure, shared by the Overview
// (and available to Inventory). Mirrors the server: stock moves only for books with "Track inventory"
// switched on (functions/inventory.js `book.trackInventory`), per edition when a book has editions;
// gift cards and box sets have no stock of their own (a box set takes stock from the books inside it),
// and digital editions never run out.

export type StockKind = "tracked" | "untracked" | "digital" | "giftCard" | "bundle";

export interface StockRow {
  bookId: string;
  variantId: string | null;
  title: string;
  /** The edition's name, or null for a book without editions. */
  edition: string | null;
  kind: StockKind;
  /** Copies on hand (only meaningful for `tracked`; 0 otherwise). */
  stock: number;
  price: number;
  /** Backorders are on: the book stays buyable at 0. */
  backorder: boolean;
}

const DIGITAL = /digital|e-book|ebook|epub|pdf|audiobook/i;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export const isGiftCardBook = (b: any) => b?.productType === "giftCard";
export const isBundleBook = (b: any) => Array.isArray(b?.bundleItems) && b.bundleItems.some((p: any) => p && typeof p.bookId === "string" && p.bookId);
const isDigitalThing = (x: any) => x?.digital === true || x?.isDigital === true || DIGITAL.test(String(x?.format || ""));

/** On sale to shoppers at some point: drafts and archived books don't need restocking. */
export const isStockListed = (b: any) => !!b && b.status !== "draft" && b.status !== "archived";

/** One row per edition (or one for the book), each with its stock kind. */
export function stockRowsFor(book: any): StockRow[] {
  if (!book) return [];
  const title = String(book.title || "Untitled");
  const base = { bookId: String(book.id || ""), title, backorder: book.allowBackorder === true };
  const bookPrice = num(book.retailPrice ?? book.price);
  if (isGiftCardBook(book)) return [{ ...base, variantId: null, edition: null, kind: "giftCard", stock: 0, price: bookPrice, backorder: false }];
  if (isBundleBook(book)) return [{ ...base, variantId: null, edition: null, kind: "bundle", stock: 0, price: bookPrice, backorder: false }];
  const tracked = book.trackInventory === true;
  const variants = Array.isArray(book.variants) ? book.variants.filter(Boolean) : [];
  if (!variants.length) {
    const kind: StockKind = isDigitalThing(book) ? "digital" : tracked ? "tracked" : "untracked";
    return [{ ...base, variantId: null, edition: null, kind, stock: kind === "tracked" ? Math.max(0, num(book.stockLevel)) : 0, price: bookPrice }];
  }
  return variants.map((v: any, i: number) => {
    const kind: StockKind = isDigitalThing(v) ? "digital" : tracked ? "tracked" : "untracked";
    const stock = Math.max(0, num(v.stockLevel !== undefined ? v.stockLevel : v.stock));
    return {
      ...base, variantId: String(v.id ?? i), edition: String(v.name || v.format || `Edition ${i + 1}`), kind,
      stock: kind === "tracked" ? stock : 0, price: num(v.price) || bookPrice,
    };
  });
}

/** Tracked rows of every listed book: the copies that can actually run out. */
export const trackedStockRows = (books: any[]) =>
  (books || []).filter(isStockListed).flatMap(stockRowsFor).filter((r) => r.kind === "tracked");

/** A row a shopper can no longer buy (0 on hand and no backorders). */
export const isSoldOut = (r: StockRow) => r.kind === "tracked" && r.stock <= 0 && !r.backorder;

/** Display label for a row: "Title" or "Title · Edition". */
export const stockRowLabel = (r: StockRow) => (r.edition ? `${r.title} · ${r.edition}` : r.title);
