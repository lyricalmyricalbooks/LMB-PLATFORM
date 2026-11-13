import type { AppUpdate } from "../appUpdates";

export default {
  id: "checkout-shop-currency",
  date: "2026-11-13",
  title: "Checkout charges in the shop's own currency",
  summary: "For a shop that sells in US dollars, checkout now treats every price as US dollars: a US shopper pays the price as it is, and a shopper browsing in Canadian dollars or euros pays that price at the day's rate from the US dollar. Order emails, refunds and new gift cards name the shop's currency too. Shops that sell in Canadian dollars are charged exactly as before. No shop sells in US dollars yet; reports, bookkeeping and past orders follow in the next updates.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
