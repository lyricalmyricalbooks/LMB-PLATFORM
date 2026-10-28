import type { AppUpdate } from "../appUpdates";

export default {
  id: "provider-wording",
  date: "2026-10-28",
  title: "Your card company's own name everywhere",
  summary: "If your shop takes cards through Square, the admin now says Square, never Stripe. That covers the order list, each order's page and its history, refunds, alerts, Ready to sell, the payments page, help text, and the emails the shop sends you. The Open in Square buttons go to your Square Dashboard. Shops that take cards through Stripe see exactly the same words as before.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
