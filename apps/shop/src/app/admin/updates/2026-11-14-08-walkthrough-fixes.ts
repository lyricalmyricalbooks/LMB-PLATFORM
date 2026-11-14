import type { AppUpdate } from "../appUpdates";

export default {
  id: "walkthrough-fixes",
  date: "2026-11-14",
  title: "Home speaks your shop's words, and checkout drops empty pictures",
  summary: "If your shop sells goods rather than books, Home's to-do tiles now say \"products sold out\" and \"products to restock soon\" instead of print books and reprints. In checkout, a product with no photo shows a plain frame instead of a broken picture.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
