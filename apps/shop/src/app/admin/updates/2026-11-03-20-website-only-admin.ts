import type { AppUpdate } from "../appUpdates";

export default {
  id: "website-only-admin",
  date: "2026-11-03",
  title: "A website-only plan no longer shows the stockroom",
  summary: "If your plan is the website on its own, the admin no longer shows the Website and Inventory switch, the inventory app link tab, the stock list for Google Sheets or the Author role, because those all need the stockroom. You keep your stock on Inventory, Stock, as before. If you add the stockroom later, they come back.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
