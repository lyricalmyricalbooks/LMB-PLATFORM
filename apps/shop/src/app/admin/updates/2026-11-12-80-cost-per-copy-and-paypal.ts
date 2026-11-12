import type { AppUpdate } from "../appUpdates";

export default {
  id: "cost-per-copy-and-paypal",
  date: "2026-11-12",
  title: "Truer profit and stock value, and PayPal refunds that reach the shop",
  summary: "The production cost you type is now always read as the whole run's cost, in both the year report and stock value, so the two agree. A title with no print run spreads its cost over the copies sold plus the copies left. Titles priced in another currency are converted at your saved rate in the year report. Payments has a new box for the ID of PayPal's notices, so PayPal can tell your shop about refunds. On Colophon, Google figures now come only through Connect Google.",
  links: [{ label: "Open Payments", tab: "settings", settingsTab: "payments" }, { label: "Open Google", tab: "settings", settingsTab: "google" }],
} satisfies AppUpdate;
