import type { AppUpdate } from "../appUpdates";

export default {
  id: "bulk-ship-orders",
  date: "2026-11-14",
  title: "Ship, deliver and print for several orders at once",
  summary: "Tick orders in the list and the bar now offers Mark shipped, Mark delivered, Packing slips and Pick list beside Mark packed. Mark shipped only takes packed orders that already have a label, and emails each customer their tracking. Anything that can't take the step is skipped and counted, so nothing is marked by mistake.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
