import type { AppUpdate } from "../appUpdates";

export default {
  id: "order-v4-page",
  date: "2026-11-12",
  title: "An order opens as its own page",
  summary: "Clicking an order now opens it as a page of its own, with ← Orders to go back. A bar near the top shows where it is: Paid, Packed, Shipped, Delivered. A bar at the bottom says what it needs next (check the address, pack it, buy a label, mark it shipped or delivered) and its button does that step.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
