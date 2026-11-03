import type { AppUpdate } from "../appUpdates";

export default {
  id: "safer-changed-orders",
  date: "2026-11-03",
  title: "Safer refunds and add-ons for changed orders",
  summary: "Two fixes for orders you change after payment. If you cancel or fully refund an order, the payment link for items added to it stops taking payment, so nobody pays for extras to a cancelled order. And if part of an order already went out, refunding it before the rest ships no longer puts the sent copies back in stock.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
