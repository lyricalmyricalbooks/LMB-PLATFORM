import type { AppUpdate } from "../appUpdates";

export default {
  id: "account-returns",
  date: "2026-11-13",
  title: "Customers ask for returns from their account",
  summary: "When you take returns, each delivered order in a customer's account now has Ask for a return, with the last day they can ask. An order that hasn't shipped has Ask to cancel. Once they ask, the account shows that you have their request and, later, how the return is going. Nothing is refunded until you act on it in Orders.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Returns settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
