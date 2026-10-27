import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-flow",
  date: "2026-10-25",
  title: "Checkout's steps now follow one tested plan",
  summary: "Paying, coming back from Stripe or PayPal, and the thank-you page now run through one set of rules with its own tests: double presses, Back from PayPal, a payment still being processed and a failed PayPal capture are each checked automatically. Shoppers see the same checkout, and prices and payments are still decided by the server.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
