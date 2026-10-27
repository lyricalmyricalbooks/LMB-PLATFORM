import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-errors",
  date: "2026-10-25",
  title: "See when the shop breaks for a shopper",
  summary: "When a page or part of a page fails to draw in a shopper's browser, the shop now notes it (without names, addresses or order numbers) and an alert tells you. Settings › General › Tools & records › Shop errors lists each problem, how often it happened and on which page, so it can be fixed before it costs a sale.",
  links: [{ label: "Open Shop errors", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
