import type { AppUpdate } from "../appUpdates";

export default {
  id: "match-by-sku",
  date: "2026-10-29",
  title: "Products pair with the stockroom by their SKU",
  summary: "For products that aren't books, like a shirt in sizes or a ring, the link to your stockroom now uses each size's SKU. When the same SKU is in both places, the match is suggested for you, the stockroom gets the SKU when you add a size from the website, and fixing a different SKU updates the SKU, not the ISBN. Books keep matching by their ISBN exactly as before.",
  links: [{ label: "Open the inventory link", tab: "inventory" }],
} satisfies AppUpdate;
