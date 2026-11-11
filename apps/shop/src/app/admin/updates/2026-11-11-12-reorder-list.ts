import type { AppUpdate } from "../appUpdates";

export default {
  id: "reorder-list",
  date: "2026-11-11",
  title: "A reorder list for what's running low",
  summary: "Stock › Reorder list shows every product about to run out, most urgent first: how many you have, how many sold in the last 30 days and last month, roughly how many weeks are left, and how many to order. Download it as Excel or CSV for your printer or supplier.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
