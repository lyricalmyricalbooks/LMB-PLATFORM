import type { AppUpdate } from "../appUpdates";

export default {
  id: "trial-banner",
  date: "2026-11-10",
  title: "Your free trial, always in view",
  summary: "The top bar shows how many trial days are left, and the banner says the exact day your trial ends. It turns amber in the last week and red in the last three days, and it stays out of the way on the Billing page.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
