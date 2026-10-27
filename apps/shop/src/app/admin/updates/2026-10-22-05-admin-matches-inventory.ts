import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-matches-inventory",
  date: "2026-10-22",
  title: "Every admin page now looks like Inventory",
  summary:
    "Settings, Shipping, Payments, Taxes and Email sender use Inventory's boxed cards, bold buttons and figures strip, line up with the page title and drop the extra Admin › Settings trail. Books gains Inventory's figures strip and status chips, with Add book on the catalog card. Reviews filters by status with chips under its figures, Email sender's status chips sit under its tabs, Discounts' share link is a small icon, and customer names are ink, not red.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
