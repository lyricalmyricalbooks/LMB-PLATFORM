import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-orders-list",
  date: "2026-11-11",
  title: "Admin redesign: one clear list of orders",
  summary: "Orders is now one list, newest first, with the order, customer, date, items, total, payment and fulfilment side by side. Pills along the top show just the unfulfilled, unpaid, shipped or refunded orders, and Export CSV and Create order sit at the top right. On a phone the shipping desk stays as it was.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
