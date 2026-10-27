import type { AppUpdate } from "../appUpdates";

export default {
  id: "extra-book-details",
  date: "2026-10-11",
  title: "Add your own rows to a book's Details tab",
  summary:
    "Books › edit › Publishing details now has More details: add as many label and value rows as you like (for example Photographs, Paper, Printing, Graphic & book design), reorder them and remove them. They appear on the book page's Details tab after the standard details, in the same style. A value can run over several lines.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
