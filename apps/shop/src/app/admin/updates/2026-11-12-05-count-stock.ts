import type { AppUpdate } from "../appUpdates";

export default {
  id: "count-stock",
  date: "2026-11-12",
  title: "Count stock, and a new Record a sale page",
  summary: "Inventory has a Count stock button. It lists everything you keep a count of, with what you expect to have. Tap Start counting on a row, then use minus and plus (or type the number) until it matches the shelf. The tiles show how many you have counted and what is off, and Finish count corrects the stock once every row is counted. Save for later keeps your counts on this device. Record a sale has the new layout too: where it sold, what was sold and a note on the left, with the total and the stock change added up beside them.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
