// The plans a press can subscribe to, and their prices from the platform settings (services/settings.js).
//
// Each price lives in Stripe under a lookup key that names the plan, currency and amount, so changing a price in the
// settings makes a new Stripe price and leaves presses already on the old one where they are until moved on purpose.
import { PLAN_NAMES, priceText } from "../settings.js";

export const PLAN_IDS = Object.freeze(["shop", "stockroom", "both"]);

/** Which apps a plan opens (the same as setup/steps.js PLANS). */
export const PLAN_APPS = Object.freeze({
  shop: Object.freeze({ shop: true, stockroom: false }),
  stockroom: Object.freeze({ shop: false, stockroom: true }),
  both: Object.freeze({ shop: true, stockroom: true }),
});

export const isPlan = (plan) => PLAN_IDS.includes(plan);

/** One plan's price: amount in cents, currency, Stripe lookup key, product id and words for people. */
export function planPrice(plan, settings) {
  if (!isPlan(plan)) throw new Error("the plan must be shop, stockroom or both");
  const amount = settings.prices[plan];
  const currency = settings.currency.toLowerCase();
  return {
    plan,
    amount,
    currency,
    lookupKey: `colophon_${plan}_${currency}_${amount}_monthly`,
    productId: `colophon_${plan}`,
    name: PLAN_NAMES[plan],
    priceText: priceText(amount, settings.currency),
  };
}

/** Every plan, for the sign-up page's plan choice. */
export const planList = (settings) => PLAN_IDS.map((plan) => planPrice(plan, settings));
