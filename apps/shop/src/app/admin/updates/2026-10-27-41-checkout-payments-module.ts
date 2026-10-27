import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-payments-module",
  date: "2026-10-27",
  title: "Checkout and Stripe setup use the same payment code",
  summary: "Maintenance only: card checkout, the Stripe key test, the webhook check-and-fix button and Apple Pay / Google Pay setup now use the same shared payment code as refunds and payment checks. Nothing changes on your screens or for shoppers. Every Stripe call your shop makes now goes through one place, so all of them can be checked together.",
  links: [{ label: "Open Payments settings", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
