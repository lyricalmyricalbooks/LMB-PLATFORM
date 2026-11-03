import { saleActive } from "./promotions";

/**
 * The CAD price a book card shows (and the shop filters/sorts by).
 * A book sold in editions is always charged an edition's own price (CartContext
 * `catalogUnitPrice`, functions/catalogPrice.js), so it shows its lowest-priced edition,
 * like Shopify's "from" price — never the book's own (sale) price, which is never charged.
 * Other books show their own price (the sale price only while the sale is on: positive, inside
 * its optional start/end dates — promotions.saleActive, the same rule the server charges by).
 * Never shows CA$ 0.00 for a book whose editions all cost money.
 */
export function editionPrices(book: any): number[] {
  const variants = Array.isArray(book?.variants) ? book.variants : [];
  return variants
    .map((variant: any) => (variant?.price === undefined || variant?.price === null || variant?.price === "" ? NaN : Number(variant.price)))
    .filter((price: number) => Number.isFinite(price) && price >= 0);
}

// `ignoreSale` asks for the "was" price a sale is shown against (wasPrice).
export function displayPrice(book: any, ignoreSale = false, now: Date = new Date()): number {
  if (!book) return 0;
  const editions = editionPrices(book);
  if (editions.length) return Math.min(...editions);
  if (!saleActive(book, now)) return Number(book.retailPrice) || 0;
  return ignoreSale ? wasPrice(book, now) : Number(book.salePrice);
}

const DAY = 86400000;

/**
 * The price a sale is shown against: the regular price, or a lower one it had in the 30 days before the sale started
 * (functions/priceHistory.js keeps them). The EU's price-indication rule and Canada's Competition Act both say a
 * struck-through price must not overstate the saving (legal review, 3 November 2026).
 */
export function wasPrice(book: any, now: Date = new Date()): number {
  const regular = Number(book?.retailPrice) || 0;
  if (!Array.isArray(book?.priceHistory)) return regular;
  const start = Date.parse(String(book?.saleStartsAt || "").slice(0, 10));
  const saleStart = Number.isFinite(start) && start < now.getTime() ? start : now.getTime();
  const earlier = book.priceHistory
    .filter((entry: any) => typeof entry?.price === "number" && entry.price > 0 && Date.parse(entry.until) >= saleStart - 30 * DAY)
    .map((entry: any) => entry.price as number);
  return Math.min(regular, ...earlier);
}

/** Whether a card may show a SALE badge / old price: only books charged their own price. */
export function showsSale(book: any, now: Date = new Date()): boolean {
  if (!book || editionPrices(book).length) return false;
  return saleActive(book, now) && Number(book.salePrice) < wasPrice(book, now);
}

/** Whole-percent saving of a sale ("20" for CA$ 20 -> CA$ 16), or 0 when the book isn't on a real sale. */
export function salePercentOff(book: any, now: Date = new Date()): number {
  if (!showsSale(book, now)) return 0;
  const base = wasPrice(book, now);
  const pct = Math.round((1 - Number(book.salePrice) / base) * 100);
  return pct >= 1 && pct <= 99 ? pct : 0;
}
