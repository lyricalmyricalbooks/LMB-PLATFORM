import type { AppUpdate } from "../appUpdates";

export default {
  id: "shop-filters-bug-sweep-6", date: "2026-10-08", title: "Shop filters and checkout fixes",
  summary: "Shoppers can filter the shop by format (paperback, hardcover, e-book, audiobook) and price, and clear filters in one click; \"In stock\" now counts editions. Checkout shows the same capped discount the shop charges, a declined card no longer locks a shopper out of the last copy, and e-book return requests can be refunded or closed directly. Functions need deploying with this release for the server-side fixes to apply.",
  links: [{ label: "Turn on shop filters in Studio", tab: "settings", settingsTab: "designer" }, { label: "Handle returns in Orders", tab: "orders" }, { label: "Review discount codes", tab: "discounts" }],
} satisfies AppUpdate;
