import type { AppUpdate } from "../appUpdates";

export default {
  id: "refund-check-follow-up",
  date: "2026-10-15",
  title: "The Stripe refund check keeps up better",
  summary: "Three small safeguards for the refund and dispute check that runs every 15 minutes. If a refund the bank rejected puts an order back to paid, the next run checks that order, even if it was paid weeks ago (up to 120 days). Orders you have just synced with Stripe yourself no longer take up the run's places, so the orders that are due still get checked. A run that reaches its time limit saves its progress and starts no further checks. Payment timing and what counts as paid are unchanged. This needs the next backend deploy; local tests don't prove it live.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
