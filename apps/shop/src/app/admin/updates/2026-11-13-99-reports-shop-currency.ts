import type { AppUpdate } from "../appUpdates";

export default {
  id: "reports-shop-currency",
  date: "2026-11-13",
  title: "Reports and bookkeeping count in the shop's own currency",
  summary: "For a shop that sells in US dollars, sales reports, the Orders file, bookkeeping, the stockroom's money pages, the tax centre's totals and the Google shopping file now count and name US dollars, and an expense paid in another currency is converted into US dollars. Shops that sell in Canadian dollars see exactly what they saw before. No shop sells in US dollars yet. The tax centre's sales tax pages are still written for Canada, and past orders brought from another shop follow in the next update.",
  links: [{ label: "Open Analytics", tab: "analytics" }, { label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
