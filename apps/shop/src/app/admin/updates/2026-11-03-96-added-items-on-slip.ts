import type { AppUpdate } from "../appUpdates";

export default {
  id: "added-items-on-slip",
  date: "2026-11-03",
  title: "Added items on the packing slip",
  summary: "When a customer adds items to an order they already paid for, the first order's packing slip now lists the paid extras under their own heading, so they go in the same parcel. If the extras aren't paid yet, the slip says so, so you don't pack them early.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
