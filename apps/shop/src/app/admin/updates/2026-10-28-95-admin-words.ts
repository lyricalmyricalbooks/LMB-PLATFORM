import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-words",
  date: "2026-10-28",
  title: "The admin says Products when you don't sell books",
  summary: "If you told us at sign-up that you sell something other than books, the admin now calls your catalog Products: the menu, the page titles, the product list and the product editor say “product” and “maker” instead of “book” and “author”. When you edit a book, the editor still talks about books. Shops that sell books see no change.",
  links: [{ label: "Open your products", tab: "catalog" }],
} satisfies AppUpdate;
