import type { AppUpdate } from "../appUpdates";

export default {
  id: "swap-for-size",
  date: "2026-10-29",
  title: "Swap a returned item for another size or colour",
  summary: "After you have received and inspected a return, a customer who wants a different size or colour no longer needs a refund and a new order. Open the order, and under the inspected return choose the version to send instead. The returned copies go back on the shelf if they were resellable, the new version comes off it, and the order records the swap. Only versions at the same price with stock are offered, no money moves, and a swap can be done once. Refunds work exactly as before.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
