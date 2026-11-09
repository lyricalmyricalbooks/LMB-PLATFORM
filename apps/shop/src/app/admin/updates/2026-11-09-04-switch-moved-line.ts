import type { AppUpdate } from "../appUpdates";

export default {
  id: "switch-moved-line",
  date: "2026-11-09",
  title: "Payments remembers your card switch",
  summary: "After your shop moves between Stripe and Square, Settings › Payments says when it moved and that orders from before then still refund through your old account.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
