import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-tabs-address-fix",
  date: "2026-10-20",
  title: "Overview tabs stay in the address, and Google gets cleaner referrers",
  summary: "Coming back to the Overview from another admin page now keeps the open tab in the address, so a copied link opens that tab and one Back press goes back one step. The keyboard arrows on the Visitors tab row now always move along that row. On the shop, the page a visitor came from is now sent to Google Analytics without any private part of its address (an order-tracking key, for example), also on the first page of a visit.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
