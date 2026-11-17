// Pay what you want (Digital D2, 17 November 2026). A product with `payWhatYouWant: true` sells at its price as the
// lowest amount, and the buyer may pay more. A lowest amount of 0 makes it a free download with an optional payment.
// One rule for the shop and the server: the bag and the product page show it, `priceOrder` charges it.

/** The most one copy can be bought for, unless the product's own price is higher. */
export const PAY_WHAT_YOU_WANT_MAX = 1000;

/** The product lets the buyer choose the amount: the product itself, never an edition, a box set or a gift card. */
export function paysWhatTheyWant(book: any, variant?: any): boolean {
  if (!book || book.payWhatYouWant !== true || variant) return false;
  if (book.productType === "giftCard" || (Array.isArray(book.bundleItems) && book.bundleItems.length > 0)) return false;
  return true;
}

/** The highest amount the buyer may type for one copy. */
export const payWhatYouWantMax = (lowest: number): number => Math.max(PAY_WHAT_YOU_WANT_MAX, lowest);

/**
 * What one copy costs: the buyer's amount (rounded to the cent) when the product lets them choose and it is between the
 * lowest and the highest; the lowest when they typed nothing. `null` refuses the line (too little, too much, not a
 * number). A product that doesn't let the buyer choose always costs `lowest`.
 */
export function chosenUnitPrice(book: any, variant: any, lowest: number, chosen: unknown): number | null {
  if (!paysWhatTheyWant(book, variant)) return lowest;
  if (chosen === undefined || chosen === null || chosen === "") return lowest;
  const amount = Math.round(Number(chosen) * 100) / 100;
  if (!Number.isFinite(amount) || amount < lowest - 0.0001 || amount > payWhatYouWantMax(lowest)) return null;
  return amount;
}
