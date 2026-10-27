import { showsSale } from "./displayPrice";

/**
 * Sale savings shown in the shopping bag (Studio › Style › Cart drawer › Book rows ›
 * Sale savings, `cartDrawerShowSavings`, off by default). Display only: the server still
 * prices every line (functions/catalogPrice.js); this only says how much below the book's
 * regular price the bag's own line price is.
 *
 * A line saves only when the book is on a real sale (`showsSale`: charged its own price, so
 * never an edition line or a gift card) and the line's price is the sale price plus its
 * add-ons. A line not yet repriced from the live catalog (a stale saved price) saves nothing,
 * so the bag never claims a saving the shopper won't get.
 */
export function lineSavingPerCopy(item: any, book: any, now: Date = new Date()): number {
  if (!item || !book || item.variantId || item.giftCard || !showsSale(book, now)) return 0;
  const addOns = (Array.isArray(item.addOns) ? item.addOns : []).reduce((sum: number, a: any) => sum + (Number(a?.price) || 0), 0);
  const sale = Number(book.salePrice);
  if (Math.abs(Number(item.price) - addOns - sale) > 0.005) return 0;
  const saving = Math.round(((Number(book.retailPrice) || 0) - sale) * 100) / 100;
  return saving > 0 ? saving : 0;
}

/** Each line's saving per copy (keyed like the bag rows) and the bag's total saving. */
export function bagSavings(cart: any[], booksById: Map<string, any>, now: Date = new Date()): { perCopy: Map<any, number>; total: number } {
  const perCopy = new Map<any, number>();
  let total = 0;
  for (const item of cart || []) {
    const saving = lineSavingPerCopy(item, booksById.get(item?.id), now);
    if (!saving) continue;
    perCopy.set(item, saving);
    total += saving * (Number(item.quantity) || 0);
  }
  return { perCopy, total: Math.round(total * 100) / 100 };
}
