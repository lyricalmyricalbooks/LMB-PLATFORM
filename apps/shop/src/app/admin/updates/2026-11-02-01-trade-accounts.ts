import type { AppUpdate } from "../appUpdates";

export default {
  id: "trade-accounts",
  date: "2026-11-02",
  title: "Trade accounts: wholesale prices for boutiques",
  summary: "In Customers, a new Trade accounts card lets you approve a shop by name and email. When that shop signs in with the approved email at checkout, it pays your private wholesale price (set in a product's Pricing) and is shown the new total before paying by card. You can pause or remove a shop any time. Shoppers who aren't on the list see no change.",
  links: [{ label: "Open customers", tab: "customers" }],
} satisfies AppUpdate;
