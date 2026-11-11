import type { AppUpdate } from "../appUpdates";

export default {
  id: "every-combination",
  date: "2026-11-11",
  title: "Sizes and colours at a glance",
  summary: "A product sold in options (Size, Colour…) now shows every combination in one table on its Variants tab: its own price, SKU and stock in each row, how many are in stock or sold out, and Set price / Set stock to fill every row at once. Inventory shows each combination's SKU and finds it when you search. In a shop that doesn't sell books, the editor says variants instead of editions. Books shops are unchanged.",
  links: [{ label: "Open Products", tab: "catalog" }, { label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
