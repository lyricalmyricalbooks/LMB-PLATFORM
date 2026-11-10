import type { AppUpdate } from "../appUpdates";

export default {
  id: "pay-what-you-use",
  date: "2026-11-10",
  title: "Pay for what your shop uses",
  summary: "Your plan is now a $5 monthly fee plus what your shop cost to run last month, at cost. Billing shows last month's running cost, and you choose an amount: we email you if a month looks set to pass it.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
