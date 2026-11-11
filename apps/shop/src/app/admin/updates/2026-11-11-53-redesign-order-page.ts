import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-order-page",
  date: "2026-11-11",
  title: "An order's page in the new look",
  summary: "Opening an order now matches the rest of the admin: the queue beside it is one white rounded card with the open order shaded, and the three steps (address, pack, label and ship) are rounded tiles with the current one outlined. The step you're on stays inside the white card instead of turning grey. Nothing on the page was added or taken away.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
