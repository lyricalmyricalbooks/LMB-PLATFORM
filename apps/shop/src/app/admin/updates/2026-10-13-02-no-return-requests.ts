import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-return-requests",
  date: "2026-10-13",
  title: "Order tracking: shoppers can only ask to cancel, before it ships",
  summary: "The order-tracking page no longer shows “Ask to return this order”. “Ask to cancel this order” is still there until the order ships; once it has shipped the box disappears. The shop's server refuses new return requests too. Return requests already open stay in Orders and can still be worked as before. The “already shipped” message no longer suggests a return; edit it in Text & labels › Order tracking.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
