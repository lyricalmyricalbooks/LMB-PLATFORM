import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-words-follow-what-you-sell",
  date: "2026-11-04",
  title: "Your shop's words follow what you sell",
  summary: "If you sell something other than books, changing What you sell in Settings now changes your shop's words for shoppers too, not only the admin's: product pages say \"options\" and \"items\" instead of \"editions\" and \"copies\", and the shop counts products, not titles. Words you wrote yourself in Studio stay. Packing slips, the back-in-stock and download emails, and more admin pages (Inventory, Orders, Team, the Overview) use the same words.",
  links: [{ label: "Open What you sell", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
