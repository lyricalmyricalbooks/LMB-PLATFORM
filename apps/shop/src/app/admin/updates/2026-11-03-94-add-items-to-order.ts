import type { AppUpdate } from "../appUpdates";

export default {
  id: "add-items-to-order",
  date: "2026-11-03",
  title: "Add items to a paid order",
  summary: "When a customer wants one more thing before you ship, open their order and choose Add items to this order. Their details and address are filled in, shipping starts at nothing, and they pay for just the extra items from a link. Both orders show each other, so you pack them in one parcel.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
