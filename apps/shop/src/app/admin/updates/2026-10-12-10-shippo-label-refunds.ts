import type { AppUpdate } from "../appUpdates";

export default {
  id: "shippo-label-refunds",
  date: "2026-10-12",
  title: "Refund unused Shippo labels, even on cancelled orders",
  summary:
    "An order that is cancelled or refunded before its parcel leaves now shows \"Unused label\" with a \"Void label for a refund\" button (before, only orders ready to ship could void a label). Older labels with no saved Shippo number are found by their tracking number. The shop never asks Shippo to refund the same label twice, and it follows each refund every 15 minutes: the order shows Pending, Refunded or Rejected, and a rejected refund (or one still pending after 30 days) appears in the alerts at the top of the admin. Shippo refunds unused labels less than 90 days old, usually within 14 business days.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
