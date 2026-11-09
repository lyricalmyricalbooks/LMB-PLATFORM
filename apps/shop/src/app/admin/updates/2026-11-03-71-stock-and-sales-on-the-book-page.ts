import type { AppUpdate } from "../appUpdates";

export default {
  id: "stock-and-sales-on-the-book-page",
  date: "2026-11-03",
  title: "Each book's stock and sales on its own page",
  summary: "If you have both the website and the stockroom, open any book and pick Stock and sales: copies on hand, who holds them (you, the author, each stockist, each of your places) and what sold on every channel, from the website to fairs and stockists, as the stockroom counts them. A book not yet matched with the stockroom shows its likely match and one button to connect them, and Change stock in the stockroom opens that book there.",
  links: [{ label: "Open your books", tab: "catalog" }],
} satisfies AppUpdate;
