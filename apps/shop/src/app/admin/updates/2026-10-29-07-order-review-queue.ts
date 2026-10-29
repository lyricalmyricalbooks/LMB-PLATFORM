import type { AppUpdate } from "../appUpdates";

export default {
  id: "order-review-queue",
  date: "2026-10-29",
  title: "Risky-looking orders wait for you",
  summary: "When the card company rates a payment as higher risk, or the card's security code or postal code didn't match, the order now lands in Needs attention with the reasons in plain words. It can't be packed, labelled or shipped until you press “It looks fine”, or you refund it. Normal orders are not held, and orders from before this update are not changed. Applies to card payments through Stripe.",
  links: [{ label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
