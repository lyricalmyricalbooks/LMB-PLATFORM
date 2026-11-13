import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-shop-currency",
  date: "2026-11-13",
  title: "Groundwork: the admin writes money in the shop's currency",
  summary: "The second step toward shops that sell in US dollars. Amounts across the admin (orders, customers, inventory, discounts, gift cards, the overview) now take their currency sign from the shop, so a US-dollar shop reads US$ where a Canadian shop reads CA$. Your shop sells in Canadian dollars, so nothing you see changes. Checkout, reports and past orders follow in the next updates.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
