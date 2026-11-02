import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-words-everywhere",
  date: "2026-11-02",
  title: "Every admin page says product, not book, for other kinds of shop",
  summary: "If you told us at sign-up that you sell something other than books, the labels, hints and placeholders on the Orders, Discounts, Gift cards, Reviews, Customers, Settings and Overview pages now read product and maker instead of book and author. Shops that sell books see exactly the same words as before.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
