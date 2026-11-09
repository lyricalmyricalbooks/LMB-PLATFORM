import type { AppUpdate } from "../appUpdates";

export default {
  id: "sale-was-price",
  date: "2026-11-03",
  title: "Crossed-out sale prices are always honest",
  summary: "If you raised a book's price in the 30 days before a sale, the crossed-out price on shop cards, the book page and the bag is now the lowest price from those 30 days, not the new higher one. The percent-off badge and bag savings use the same price. If the sale price isn't below it, the shop doesn't call it a sale. That's what European and Canadian price rules ask for.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Discounts", tab: "discounts" }],
} satisfies AppUpdate;
