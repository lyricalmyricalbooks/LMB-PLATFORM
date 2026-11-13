import type { AppUpdate } from "../appUpdates";

export default {
  id: "choose-what-to-download",
  date: "2026-11-13",
  title: "Choose what to download",
  summary: "Beside Download your shop there's now Choose what to download: pick the parts you want (products, customers, orders, photos, pages, settings, and the stockroom), only the orders between two days, and spreadsheets as CSV for another shop system or Excel to read. Skipping photos makes it quick. The window also lists your last downloads.",
  links: [{ label: "Open Billing", tab: "settings", settingsTab: "billing" }],
} satisfies AppUpdate;
