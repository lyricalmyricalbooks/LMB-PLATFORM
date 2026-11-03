import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-low-stock-line",
  date: "2026-11-03",
  title: "One low-stock line everywhere",
  summary: "The low-stock line you set in Inventory now applies everywhere: the Running low card on your Overview, the stock badges in your product list and product editor, and the 8am email all agree. Before, everything except Inventory used five, whatever you'd set.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
