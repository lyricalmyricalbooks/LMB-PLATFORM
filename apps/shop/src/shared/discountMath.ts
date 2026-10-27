// Discount arithmetic, one copy for the shop and the server (src/shared/CLAUDE.md). The server's figure
// (functions/shared/discountMath.js, used by every checkout path: Stripe, PayPal, manual, free) is the one
// charged; the shop runs the same code for display. Items are catalog-priced lines; gift-card lines and a
// free-gift line are never discounted. Thrown messages are the server's English text; checkout shows its
// own Text & labels copy chosen from `DiscountProblem.code`.

// The stored discount shape lives in ./discountRecord (with the schema the Discounts screen checks saves against).
export type { DiscountType, DiscountTier, DiscountRecord } from "./discountRecord";

/** Percent off the "get" items of a buy-X-get-Y offer: missing means fully free, others clamp to 0-100. */
export function bogoPercent(value: unknown): number {
  if (value === undefined || value === null || value === '') return 100;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 100;
}

/**
 * Why a discount doesn't apply. `message` is the server's English wording (kept for parity);
 * shopper-facing text should be chosen from `code` (+ `values`) via Text & labels.
 */
export class DiscountProblem extends Error {
  code: string;
  values: Record<string, string | number>;
  constructor(code: string, message: string, values: Record<string, string | number> = {}) {
    super(message);
    this.name = "DiscountProblem";
    this.code = code;
    this.values = values;
  }
}

export type DiscountLine = { id: string; price: number; quantity: number; giftCard?: boolean; promoGift?: boolean; [key: string]: any };

export function moneyFmt(n: unknown): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

/** Gift cards are bought at face value and the free-gift line is paid for by its own discount. */
export const discountableItems = <T extends { giftCard?: boolean; promoGift?: boolean }>(items: T[] | null | undefined): T[] =>
  (items || []).filter((item) => item && item.giftCard !== true && item.promoGift !== true);

/** Never more than the books cost and never negative; then the optional cap. */
export function computeDiscountAmount(discount: any, items: DiscountLine[], booksById: Record<string, any>): number {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const raw = Number(computeRawDiscountAmount(discount, items, booksById)) || 0;
  return capDiscountAmount(discount, Math.max(0, Math.min(raw, subtotal)));
}

/** Optional "Maximum discount" ceiling (CA$); never raises an amount. */
export function capDiscountAmount(discount: any, amount: number): number {
  const cap = Number(discount && discount.maxDiscountAmount);
  return cap > 0 && amount > cap ? cap : amount;
}

const inCategories = (discount: any, booksById: Record<string, any>, item: DiscountLine) => {
  const cats = (booksById[item.id] && booksById[item.id].categories) || [];
  const selected = discount.selectedCategories || [];
  return cats.some((c: string) => selected.includes(c));
};

export function computeRawDiscountAmount(discount: any, items: DiscountLine[], booksById: Record<string, any>, ctx: { giftPrice?: number } = {}): number {
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (discount.minOrderAmount && subtotal < Number(discount.minOrderAmount)) {
    throw new DiscountProblem("min_order", `This code requires a minimum order of ${moneyFmt(discount.minOrderAmount)}.`, { amount: Number(discount.minOrderAmount) });
  }
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  if (discount.minQuantity && totalQty < Number(discount.minQuantity)) {
    throw new DiscountProblem("min_quantity", `This code requires a minimum of ${discount.minQuantity} items.`, { count: Number(discount.minQuantity) });
  }

  // 1. BOGO
  if (discount.type === "bogo") {
    const buyQty = Number(discount.buyQuantity) || 1;
    const getQty = Number(discount.getQuantity) || 1;
    const getVal = bogoPercent(discount.getDiscountValue);
    let qualItems: DiscountLine[];
    if (discount.appliesTo === "categories") {
      qualItems = items.filter((i) => inCategories(discount, booksById, i));
      if (qualItems.length === 0) throw new DiscountProblem("bogo_categories", "This BOGO code only applies to specific categories not in your cart.");
    } else if (discount.appliesTo === "products") {
      const selected = discount.selectedProducts || [];
      qualItems = items.filter((i) => selected.includes(i.id));
      if (qualItems.length === 0) throw new DiscountProblem("bogo_products", "This BOGO code only applies to specific products not in your cart.");
    } else {
      qualItems = items;
    }
    const unitPrices: number[] = [];
    qualItems.forEach((i) => { for (let k = 0; k < i.quantity; k++) unitPrices.push(i.price); });
    const totalQualUnits = unitPrices.length;
    const requiredUnits = buyQty + getQty;
    if (totalQualUnits < requiredUnits) throw new DiscountProblem("bogo_min_items", `This code requires buying at least ${requiredUnits} qualifying items.`, { count: requiredUnits });
    unitPrices.sort((a, b) => b - a);
    const sets = Math.floor(totalQualUnits / requiredUnits);
    const discountQty = sets * getQty;
    let discountAmount = 0;
    unitPrices.slice(-discountQty).forEach((price) => { discountAmount += price * (getVal / 100); });
    return discountAmount;
  }

  // 2. Tiered
  if (discount.type === "tiered") {
    const tiers = discount.tiers || [];
    if (!Array.isArray(tiers) || tiers.length === 0) return 0;
    let qualSubtotal = subtotal;
    if (discount.appliesTo === "categories") {
      qualSubtotal = items.reduce((s, i) => (inCategories(discount, booksById, i) ? s + i.price * i.quantity : s), 0);
      if (qualSubtotal === 0) throw new DiscountProblem("tiered_categories", "This tiered code only applies to specific categories not in your cart.");
    } else if (discount.appliesTo === "products") {
      const selected = discount.selectedProducts || [];
      qualSubtotal = items.reduce((s, i) => (selected.includes(i.id) ? s + i.price * i.quantity : s), 0);
      if (qualSubtotal === 0) throw new DiscountProblem("tiered_products", "This tiered code only applies to specific products not in your cart.");
    }
    const sortedTiers = [...tiers].sort((a: any, b: any) => Number(b.minSpend) - Number(a.minSpend));
    const matchingTier = sortedTiers.find((t: any) => qualSubtotal >= Number(t.minSpend));
    if (!matchingTier) {
      const lowestMinSpend = Math.min(...tiers.map((t: any) => Number(t.minSpend)));
      throw new DiscountProblem("tiered_min_spend", `This code requires a minimum spend of ${moneyFmt(lowestMinSpend)} on qualifying items.`, { amount: lowestMinSpend });
    }
    const val = Number(matchingTier.value);
    if (matchingTier.type === "percentage") return qualSubtotal * (Math.min(100, Math.max(0, val)) / 100);
    if (matchingTier.type === "fixed") return Math.min(val, qualSubtotal);
    return 0;
  }

  // 3. Percentage & fixed (and the targeting checks every other type shares)
  let qualifying = subtotal;
  if (discount.appliesTo === "categories") {
    qualifying = items.reduce((s, i) => (inCategories(discount, booksById, i) ? s + i.price * i.quantity : s), 0);
    if (qualifying === 0) throw new DiscountProblem("categories", "This code only applies to specific categories not in your cart.");
  } else if (discount.appliesTo === "products") {
    const selected = discount.selectedProducts || [];
    qualifying = items.reduce((s, i) => (selected.includes(i.id) ? s + i.price * i.quantity : s), 0);
    if (qualifying === 0) throw new DiscountProblem("products", "This code only applies to specific products not in your cart.");
  }

  // 4. Free gift: the gift's own catalog price (the caller adds the gift line).
  if (discount.type === "gift") {
    const price = Number(ctx.giftPrice);
    if (!Number.isFinite(price) || price < 0) throw new DiscountProblem("gift_unavailable", "The free gift is not available right now.");
    return price;
  }
  if (discount.type === "percentage") return qualifying * (Math.min(100, Math.max(0, Number(discount.value))) / 100);
  if (discount.type === "fixed") return Math.min(Number(discount.value), qualifying);
  return 0;
}

/** A free gift's discount is exactly the gift line's price, never capped. */
export function discountAmountFor(discount: any, items: DiscountLine[], booksById: Record<string, any>, ctx: { giftPrice?: number } = {}): number {
  if (discount && discount.type === "gift") {
    computeRawDiscountAmount(discount, items, booksById, ctx); // conditions + availability
    return Math.max(0, Number(ctx.giftPrice) || 0);
  }
  return computeDiscountAmount(discount, items, booksById);
}

export type AutomaticPick = { discount: any; amount: number; freeShipping: boolean };

/**
 * Automatic discounts (no code): one per order. Biggest saving wins; free shipping only when no
 * money-off offer applies; ties go to the oldest id. `giftPriceOf` returns NaN when a gift can't be given.
 */
export function pickAutomaticDiscount(discounts: any[], items: DiscountLine[], booksById: Record<string, any>, giftPriceOf: (discount: any) => number = () => NaN): AutomaticPick | null {
  const sorted = [...(discounts || [])].filter(Boolean).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let best: AutomaticPick | null = null;
  for (const discount of sorted) {
    if (discount.type === "freeship") continue;
    let amount = 0;
    try {
      amount = discountAmountFor(discount, items, booksById, { giftPrice: discount.type === "gift" ? giftPriceOf(discount) : undefined });
    } catch {
      continue;
    }
    const cents = Math.round(amount * 100);
    if (cents > 0 && (!best || cents > Math.round(best.amount * 100))) best = { discount, amount: cents / 100, freeShipping: false };
  }
  if (best) return best;
  for (const discount of sorted) {
    if (discount.type !== "freeship") continue;
    try {
      computeRawDiscountAmount(discount, items, booksById);
      return { discount, amount: 0, freeShipping: true };
    } catch {
      // Conditions not met.
    }
  }
  return null;
}
