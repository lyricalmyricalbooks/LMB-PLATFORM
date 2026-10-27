import type { AppUpdate } from "../appUpdates";

export default {
  id: "checked-order-actions",
  date: "2026-10-25",
  title: "Refunds and cancellations are checked on both ends",
  summary: "When you refund, cancel or put back stock for an order, the admin and the server now use one shared description of what that request contains. A request that doesn't match it is turned away before the order is touched, and a change on one side that the other doesn't expect fails the automatic checks instead of reaching a real refund. Nothing changes in how you refund or cancel. Takes effect once the server update is deployed.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
