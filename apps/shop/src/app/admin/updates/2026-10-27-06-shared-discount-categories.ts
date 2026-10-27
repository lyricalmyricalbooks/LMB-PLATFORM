import type { AppUpdate } from "../appUpdates";

export default {
  id: "shared-discount-categories",
  date: "2026-10-27",
  title: "One copy of the category discount rules",
  summary: "The Discounts screen, checkout and the server now work out which books a category discount covers with the very same code, including sub-categories and old category names. A shopper can no longer see a category saving in the bag that the payment step then refuses. Your discount codes and categories stay exactly as they are.",
  links: [{ label: "Open discounts", tab: "discounts" }],
} satisfies AppUpdate;
