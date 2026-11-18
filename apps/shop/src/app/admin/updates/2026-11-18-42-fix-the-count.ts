import type { AppUpdate } from "../appUpdates";

export default {
  id: "fix-the-count",
  date: "2026-11-18",
  title: "Fix the stock count from a product",
  summary: "Counted your shelf and it doesn't match? Open the product, go to Stock and sales, type how many copies you have and press Fix the count. Missing copies are written off in the stockroom, so its count stays the one true figure.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
