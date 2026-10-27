import type { AppUpdate } from "../appUpdates";

export default {
  id: "sub-tab-links",
  date: "2026-10-20",
  title: "Sub tabs keep their place, and alerts open the right one",
  summary: "The sub tab you have open is now part of the page address. Reloading the page, pressing the browser's Back or Forward button, or opening a copied link lands on the same sub tab (for example Settings › General › Visitors & Google, or Inventory › Inventory app link). Shipping's tabs work the same way. Switching sub tabs doesn't add extra Back steps. Alerts at the top of the admin now open the tab that holds the fix: inventory app alerts open Inventory app link, email alerts open Email sender › Deliveries, and backup alerts open General › Tools & records.",
  links: [
    { label: "Email deliveries", tab: "settings", settingsTab: "notifications" },
    { label: "Inventory", tab: "inventory" },
  ],
} satisfies AppUpdate;
