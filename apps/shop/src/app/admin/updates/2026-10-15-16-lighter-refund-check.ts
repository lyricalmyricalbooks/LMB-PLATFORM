import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-refund-check",
  date: "2026-10-15",
  title: "The Stripe refund check reads much less",
  summary: "Every 15 minutes the shop asks Stripe whether a paid order was refunded or disputed without the usual notice reaching it. That check used to re-read every paid order from the last 120 days each time, and wrote to each order it checked. It now keeps its check times in one record. Each run reads only new payments and the orders due for a check, and it no longer writes to orders. The timing is the same: a new payment is checked on the next run, then every 6 hours. Two things are a little stronger. An order whose refund couldn't be applied is retried on the next run instead of 6 hours later. Orders Stripe can't answer for no longer hold up the rest. This needs the next backend deploy; local tests don't prove the live savings.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
