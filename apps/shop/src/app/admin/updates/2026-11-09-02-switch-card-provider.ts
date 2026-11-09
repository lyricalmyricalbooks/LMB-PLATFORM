import type { AppUpdate } from "../appUpdates";

export default {
  id: "switch-card-provider",
  date: "2026-11-09",
  title: "Switch between Square and Stripe",
  summary: "Your shop can now move its card payments from Stripe to Square, or back, after it opens. Connect the other account in Settings › Payments and press Switch. Older orders keep refunding through the account that took them, and no sale is lost while the move finishes.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
