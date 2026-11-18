import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockroom-polish",
  date: "2026-11-18",
  title: "Tidier stockroom pages",
  summary: "Sales' Money taken no longer breaks a sum in the middle, and puts each currency on its own line. Add book sits by the title on Stock and sales. Repeating invoices keep Pause and Delete side by side. Artist payouts sits in a proper card, Parcels names its status column, Reorder offers Excel first, and Count no longer shows a lone dash under a product with no format.",
  links: [{ label: "Inventory", tab: "inventory" }],
} satisfies AppUpdate;
