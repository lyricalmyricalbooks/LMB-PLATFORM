import type { AppUpdate } from "../appUpdates";

export default {
  id: "take-items-off",
  date: "2026-11-03",
  title: "Take items off a paid order",
  summary: "When a customer changes their mind before you ship, open the order, choose Take items off this order, and pick what comes off. The refund amount fills in for you, the copies go back in stock, and the packing list, packing slip and label weight only count what's left.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
