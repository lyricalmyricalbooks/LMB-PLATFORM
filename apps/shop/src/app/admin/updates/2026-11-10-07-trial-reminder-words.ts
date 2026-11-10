import type { AppUpdate } from "../appUpdates";

export default {
  id: "trial-reminder-words",
  date: "2026-11-10",
  title: "The trial banner names the real reminder",
  summary: "The free trial banner now says we email you 3 days before your trial ends, which is the reminder that actually goes out.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
