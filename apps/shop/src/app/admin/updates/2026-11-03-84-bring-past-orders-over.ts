import type { AppUpdate } from "../appUpdates";

export default {
  id: "bring-past-orders-over",
  date: "2026-11-03",
  title: "Bring your past orders over",
  summary: "Orders › Bring past orders over reads the order file from your old shop and shows how many orders, how much in sales and how many customers it holds before anything is saved. Each order comes over as history: it counts in your sales reports and in the customer's history, but changes no stock, sends no email and takes no payment. Bringing the same file again adds nothing twice.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
