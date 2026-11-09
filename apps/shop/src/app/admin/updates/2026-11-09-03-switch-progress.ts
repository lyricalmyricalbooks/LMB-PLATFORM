import type { AppUpdate } from "../appUpdates";

export default {
  id: "switch-progress",
  date: "2026-11-09",
  title: "See how your card switch is going",
  summary: "While your shop moves between Stripe and Square, Settings › Payments now says when the switch started. If it takes more than a day, it tells you Colophon is already on it. Sales keep going through your old account until it's done.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
