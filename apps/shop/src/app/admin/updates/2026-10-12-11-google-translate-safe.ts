import type { AppUpdate } from "../appUpdates";

export default {
  id: "google-translate-safe",
  date: "2026-10-12",
  title: "Shoppers can translate the shop with Google Translate",
  summary:
    "Visitors who use their browser's “Translate this page” (Google Translate in Chrome, and the same feature in Edge and Safari) can now keep shopping in their own language. Before, translating the page could make the shop go blank as soon as a shopper opened the bag, changed a filter or clicked a link. Prices and totals in the shop, the bag and checkout are left untranslated so they always show the current amount. Nothing to set up; checked with automated tests, not yet on the live site.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
