import type { AppUpdate } from "../appUpdates";

export default {
  id: "match-editions-stockroom",
  date: "2026-11-16",
  title: "Match each edition with the stockroom",
  summary: "A product sold in editions, like a paperback and a hardcover, can now be matched to the stockroom one edition at a time. Open the product's Stock and sales tab: each printed edition has the stockroom book it most likely is already picked, and one Match button. Editions of one product may share a pile of copies. E-books are left out because the stockroom doesn't count them.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
