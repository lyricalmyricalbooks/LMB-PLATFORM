// Billing, put together from its environment and the clients it is handed. The function that hosts it (platform
// project, not built yet) calls this once.
//
//   BILLING_MODE                     "test" (default) or "live": which Stripe mode presses are billed in
//   STRIPE_BILLING_WEBHOOK_SECRET    the signing secret(s) of the platform account's own events address (not the
//                                    Connect one), comma-separated while one is being rolled
//   BILLING_TAX                      "on" turns on Stripe Tax for the plan prices, shown "plus tax" (code plan 6.12);
//                                    off unless set (true, on, yes or 1)
//
// Prices, trial length, currency and the platform's pages come from services/settings.js. The Stripe key is read by
// services/payments only (platformBillingStripe).
import { platformBillingStripe } from "../payments/index.js";
import { platformSettings } from "../settings.js";
import { createBilling } from "./billing.js";

export { createBilling, ACCESS, APP_NAMES, BillingError, CARD_WARNING_DAYS, DOWNLOAD_DAYS, cardEnds, cardWords, dateText, fromSubscription, planOpening } from "./billing.js";
export { planList, planPrice, PLAN_IDS, PLAN_APPS, isPlan } from "./plans.js";

export function readBillingConfig(env = {}) {
  const mode = (env.BILLING_MODE ?? "test").trim() || "test";
  if (mode !== "test" && mode !== "live") throw new Error('BILLING_MODE must be "test" or "live"');
  const webhookSecrets = String(env.STRIPE_BILLING_WEBHOOK_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const taxWord = String(env.BILLING_TAX ?? "").trim().toLowerCase();
  if (taxWord && !["on", "off", "true", "false", "yes", "no", "1", "0"].includes(taxWord)) throw new Error('BILLING_TAX must be "on" or "off"');
  return { mode, webhookSecrets, tax: ["on", "true", "yes", "1"].includes(taxWord) };
}

export function createBillingFromEnv({ env = process.env, fetch = globalThis.fetch, customers, subscriptions, events, registry, auditLog, email, closeApp, now }) {
  const { mode, webhookSecrets, tax } = readBillingConfig(env);
  return createBilling({ stripe: platformBillingStripe({ env, fetch }), mode, settings: platformSettings(env), customers, subscriptions, events, registry, auditLog, email, webhookSecrets, tax, closeApp, now });
}
