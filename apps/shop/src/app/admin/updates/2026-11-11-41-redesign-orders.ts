import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-orders",
  date: "2026-11-11",
  title: "Admin redesign: Orders",
  summary: "Open, Completed and All orders are now round filter buttons, and order covers are rounded tiles. The Table view has the same Covers / Table switch and a Ship station button, so moving between them takes one click.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
