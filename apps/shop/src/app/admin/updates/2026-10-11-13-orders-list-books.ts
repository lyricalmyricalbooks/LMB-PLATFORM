import type { AppUpdate } from "../appUpdates";

export default {
  id: "orders-list-books", date: "2026-10-11", title: "Orders list shows the book and its cover",
  summary: "Each order in the Orders list now shows the book's title (\"+ 2 more\" when there are others) and its cover. Refunded orders stand out: a red row with a red Refunded badge and the amount struck through. Partly refunded orders and refunds still in progress are tinted red too.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
