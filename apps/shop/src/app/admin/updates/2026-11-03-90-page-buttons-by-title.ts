import type { AppUpdate } from "../appUpdates";

export default {
  id: "page-buttons-by-title",
  date: "2026-11-03",
  title: "Main buttons now sit next to the page title",
  summary: "Add book, New discount, Issue gift card and Bring customers over now sit at the top right of their page, where you'd look for them first, instead of halfway down among the filters. The Books list fits a laptop screen better: the tick box shares the order column, and the format and ISBN share one. Discounts and Gift cards no longer show a row of zeros before you've made any.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
