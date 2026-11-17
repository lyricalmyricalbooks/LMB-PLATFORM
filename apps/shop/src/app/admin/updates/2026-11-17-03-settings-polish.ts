import type { AppUpdate } from "../appUpdates";

export default {
  id: "settings-polish",
  date: "2026-11-17",
  title: "Tidier Settings pages",
  summary: "Every Settings page now uses the same soft, rounded fields and round on/off switches. On a phone, cards sit tighter and the fold arrow stays beside the card's title instead of taking a row of its own, and paired fields stack so they're easy to tap. Email sender and Security have a short line under their title like the other pages. Shipping is unchanged.",
  links: [{ label: "General", tab: "settings", settingsTab: "general" }, { label: "Payments", tab: "settings", settingsTab: "payments" }],
} satisfies AppUpdate;
