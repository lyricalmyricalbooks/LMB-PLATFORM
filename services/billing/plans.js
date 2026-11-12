// The plans a press can subscribe to, and their prices from the platform settings (services/settings.js).
//
// Each price lives in Stripe under a lookup key that names the plan, currency and amount, so changing a price in the
// settings makes a new Stripe price and leaves presses already on the old one where they are until moved on purpose.
import { PLAN_NAMES } from "../settings.js";
import { feeIn, homeCurrency, moneyWords } from "./currencies.js";

// One product since 10 November 2026 (Julian): every shop gets the website and the stockroom, so "both" is the only plan
// a press can be on. "shop" and "stockroom" are kept only to read older rows; billing's daily sweep moves those shops to
// "both" (billing.js giveEveryApp) and the shop maker builds the app they were missing (signup/shopMaker.js syncPlan).
export const PLAN = "both";
export const PLAN_IDS = Object.freeze([PLAN]);
export const OLD_PLANS = Object.freeze(["shop", "stockroom"]);

/** Which apps a plan opens (the same as setup/steps.js PLANS). */
export const PLAN_APPS = Object.freeze({
  shop: Object.freeze({ shop: true, stockroom: false }),
  stockroom: Object.freeze({ shop: false, stockroom: true }),
  both: Object.freeze({ shop: true, stockroom: true }),
});

/** A plan a row can hold: the one plan, or an older one still being moved to it. */
export const isPlan = (plan) => plan === PLAN || OLD_PLANS.includes(plan);

/**
 * One plan's price in `currency` (the press's billing currency, currencies.js; the home currency when not given):
 * amount in cents, currency, Stripe lookup key, product id and words for people.
 */
export function planPrice(plan, settings, currency = homeCurrency(settings)) {
  if (!isPlan(plan)) throw new Error("the plan must be shop, stockroom or both");
  const code = String(currency).toUpperCase();
  const amount = feeIn(plan, settings, code);
  currency = code.toLowerCase();
  return {
    plan,
    amount,
    currency,
    lookupKey: `colophon_${plan}_${currency}_${amount}_monthly`,
    productId: `colophon_${plan}`,
    name: PLAN_NAMES[plan],
    priceText: moneyWords(amount, code, settings),
  };
}

/** The one plan, as a list (the pricing page and the Plan page read a list). */
export const planList = (settings) => PLAN_IDS.map((plan) => planPrice(plan, settings));
