import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-orders-list",
  date: "2026-11-11",
  title: "Admin redesign: one clear list of orders, with Customers beside it",
  summary: "Orders is now one list, newest first, with the order, customer, date, items, total, payment and fulfilment side by side. Payment reads Paid, Unpaid or Refunded and fulfilment reads Unfulfilled, Shipped or Fulfilled, with "Needs you" when an order has a problem. Pills along the top show just the unfulfilled, unpaid, shipped or refunded orders, and Export CSV and Create order sit at the top right. Customers has moved into Orders, next to All sales and Messages, so the side menu is down to Home, Orders, Books, Marketing, Online store and Settings. On a phone the shipping desk stays as it was.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
