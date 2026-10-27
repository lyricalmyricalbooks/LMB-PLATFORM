import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-shipping-rules",
  date: "2026-10-26",
  title: "Shipping prices come from one set of rules",
  summary: "The shop and the server used to keep separate copies of your shipping rules: zones, countries, rates and weights. They now share a single copy, so the shipping price a shopper sees in the bag and on a book page is worked out by exactly the same rules that set the price at checkout. Nothing changes in how you set up shipping. Takes effect once the server update is deployed.",
  links: [{ label: "Open Shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
