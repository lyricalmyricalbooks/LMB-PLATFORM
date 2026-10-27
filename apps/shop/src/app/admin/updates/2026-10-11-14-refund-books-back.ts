import type { AppUpdate } from "../appUpdates";

export default {
  id: "refund-books-back", date: "2026-10-11", title: "Put a refunded order's books back in stock",
  summary: "When an order was refunded without putting its books back in stock, its page now says so and offers Put the books back in stock. The copies go back into stock once, and the inventory app turns that order's gratuity into a void sale, so its count goes back up too. No money moves.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
