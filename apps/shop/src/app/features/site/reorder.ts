import { quickAddChoice } from "./buyable";
import { isLiveBook } from "./liveBook";

export type ReorderLine = { book: any; variant?: any; quantity: number };
export type ReorderPlan = { lines: ReorderLine[]; skipped: number };

/**
 * "Buy again" for a past order: which lines can go back in the bag.
 * Only plain books are re-added at today's catalog price and stock (the server still
 * re-prices at checkout). Gift cards, free gifts and lines with paid extras are
 * skipped because they need the shopper's own choices again.
 */
export function reorderPlan(order: any, books: any[]): ReorderPlan {
  const byId = new Map((books || []).map((b: any) => [b.id, b]));
  const lines: ReorderLine[] = [];
  let skipped = 0;
  for (const item of Array.isArray(order?.items) ? order.items : []) {
    const book = byId.get(item?.itemId ?? item?.id);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(item?.quantity)) || 1));
    const needsChoices = item?.promoGift || item?.giftCard || item?.giftCardDetails || (Array.isArray(item?.addOns) && item.addOns.length > 0);
    if (!book || needsChoices || !isLiveBook(book)) { skipped++; continue; }
    let variant: any;
    if (item?.variantId) {
      variant = (book.variants || []).find((v: any) => v.id === item.variantId);
      if (!variant) { skipped++; continue; }
    } else if (Array.isArray(book.variants) && book.variants.length) {
      const choice = quickAddChoice(book);
      if (!choice.variant) { skipped++; continue; }
      variant = choice.variant;
    }
    lines.push({ book, variant, quantity: qty });
  }
  return { lines, skipped };
}
