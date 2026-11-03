import type { AppUpdate } from "../appUpdates";

export default {
  id: "two-more-old-shop-files",
  date: "2026-11-03",
  title: "Bring products from two more kinds of old shop file",
  summary: "Books, Import now also reads a product file that lists each product on one line and its versions on the lines under it, and an item list with one line per version and stock for each place you sell. Sizes, colours, sale prices and stock come across, and the preview shows everything before anything is saved.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
