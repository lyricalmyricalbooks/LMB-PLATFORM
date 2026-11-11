import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-books",
  date: "2026-11-11",
  title: "Admin redesign: a simpler Books page",
  summary: "Books now opens on four tiles (all your books, on sale online, running low, sold out) and one list in your shop's order, with each book's cover or initials, format and ISBN, price, copies online and whether it is live. Import and Add book sit at the top right, and each row's menu still edits, copies, shows or deletes a book. The old filters, bulk edits, exports and drag-to-arrange are gone.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
