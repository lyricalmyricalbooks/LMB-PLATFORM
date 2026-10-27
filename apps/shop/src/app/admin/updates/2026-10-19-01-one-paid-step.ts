import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-paid-step",
  date: "2026-10-19",
  title: "Card, PayPal and manual payments now mark orders paid the same way",
  summary: "Behind the scenes, Stripe, PayPal, e-Transfer/cash and free or gift-card orders now all go through one step when a payment is confirmed: it takes the books out of stock, counts the discount code's use, takes the gift-card amount and records the sale, once. Card and PayPal orders now also note that the stock and discount were counted, as manual orders already did, so a repeated payment notice can never count them twice. Nothing changes on the shop or in Orders. This takes effect when the Cloud Functions are deployed.",
  links: [{ label: "Orders", tab: "orders" }],
} satisfies AppUpdate;
