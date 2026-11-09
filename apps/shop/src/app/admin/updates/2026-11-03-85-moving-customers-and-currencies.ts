import type { AppUpdate } from "../appUpdates";

export default {
  id: "moving-customers-and-currencies",
  date: "2026-11-03",
  title: "Brought-over customers listed, and past orders in other currencies",
  summary: "Customers you bring over from your old shop now appear in Customers straight away, under Not ordered here yet, with their name and town. Bring past orders over can also take orders sold in another currency: type what one unit was worth in Canadian dollars and each order is converted, keeping what the old shop charged. A new help answer lists everything you can bring over, in order.",
  links: [{ label: "Open Customers", tab: "customers" }, { label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
