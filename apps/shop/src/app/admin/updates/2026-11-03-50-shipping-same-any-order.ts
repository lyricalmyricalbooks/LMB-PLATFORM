import type { AppUpdate } from "../appUpdates";

export default {
  id: "shipping-same-any-order",
  date: "2026-11-03",
  title: "Shipping costs the same whatever order things go in the bag",
  summary: "When a bag held products from two shipping profiles whose rates start at the same price, the shipping could differ depending on which product was added first. It now always charges the lower of the two, so two shoppers with the same bag pay the same. New automatic checks now try hundreds of random bags against the shipping and tax sums every time the shop is updated, which is how this was found.",
  links: [{ label: "Open shipping settings", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
