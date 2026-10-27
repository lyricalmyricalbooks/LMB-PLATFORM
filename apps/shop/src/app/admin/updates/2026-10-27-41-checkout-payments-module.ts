import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-payments-module",
  date: "2026-10-27",
  title: "Checkout and Stripe setup use the same payment code",
  summary: "Maintenance only: card checkout, the Stripe key test, the webhook check-and-fix button and Apple Pay / Google Pay setup now use the same shared payment code as refunds and payment checks. That shared code is built so another card payment company could be added later. Stripe is still the only one, and nothing changes on your screens or for shoppers.",
  links: [{ label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
