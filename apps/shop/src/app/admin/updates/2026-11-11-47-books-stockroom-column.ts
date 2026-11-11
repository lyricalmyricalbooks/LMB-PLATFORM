import type { AppUpdate } from "../appUpdates";

export default {
  id: "books-stockroom-column",
  date: "2026-11-11",
  title: "Books shows your stockroom count",
  summary: "When you run a stockroom too, the Books list now shows how many copies the stockroom holds beside the copies on sale online, as in the redesign. A book not yet matched to the stockroom shows a dash.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
