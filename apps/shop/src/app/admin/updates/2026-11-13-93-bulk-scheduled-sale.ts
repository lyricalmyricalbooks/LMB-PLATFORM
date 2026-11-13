import type { AppUpdate } from "../appUpdates";

export default {
  id: "bulk-scheduled-sale",
  date: "2026-11-13",
  title: "Put many products on sale at once, with dates",
  summary: "On Products, tick the ones you want and press Put on sale. Choose a percent off and the days it runs: shoppers pay the sale price only between those days, and the regular price comes back by itself. End sale takes the ticked products off sale.",
  links: [{ label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
