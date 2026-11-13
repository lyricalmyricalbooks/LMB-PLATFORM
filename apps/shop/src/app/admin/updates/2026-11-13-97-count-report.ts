import type { AppUpdate } from "../appUpdates";

export default {
  id: "count-report",
  date: "2026-11-13",
  title: "A report after every stock count",
  summary: "When you finish Count stock, you now see what was missing and what turned up, item by item, with what it is worth at your cost price. Download report gives you the same list as a spreadsheet for your records.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
