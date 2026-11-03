import type { AppUpdate } from "../appUpdates";

export default {
  id: "bulk-change-kind",
  date: "2026-11-03",
  title: "Change what many products are in one go, and better Material and Care boxes",
  summary: "Select several products in the catalog, choose Bulk edit, then Change what these are. Pick book, clothing, shoes, jewellery, art, music or something else and every selected product is re-labelled the same way the product editor does it. Prices, stock and photos are not touched. In the product editor, the Material and Care boxes now ask the right thing for what you sell (metal and stones for a ring, the pressing for a record), and clothing, shoes and jewellery get one-click care wording to start from.",
  links: [{ label: "Open the catalog", tab: "catalog" }],
} satisfies AppUpdate;
