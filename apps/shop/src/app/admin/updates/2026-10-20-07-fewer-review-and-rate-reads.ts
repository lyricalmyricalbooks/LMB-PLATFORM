import type { AppUpdate } from "../appUpdates";

export default {
  id: "fewer-review-and-rate-reads",
  date: "2026-10-20",
  title: "Book pages and currency prices use fewer database reads",
  summary: "A maintenance change to lower Firebase costs; shoppers and you see exactly the same thing. When a book has fewer than 50 approved reviews, the book page now works out the star rating and review count from the reviews it already loaded instead of asking the database a second time. Books with 50 or more reviews still get the database's own count. The exchange rates used for USD and EUR prices are now remembered for an hour by the whole browser rather than by each tab, so a shopper opening several tabs reads them once. Rates still refresh hourly and checkout still charges the shop's saved rates.",
  links: [{ label: "Reviews", tab: "reviews" }, { label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
