import type { AppUpdate } from "../appUpdates";

export default {
  id: "description-pictures",
  date: "2026-10-28",
  title: "Pictures in book descriptions move with your shop",
  summary: "When you bring books over from your old shop, pictures placed inside a book's description are now copied into your own shop's storage too, the same way the book photos already were. The description is then pointed at the copy, so those pictures keep showing after the old shop closes. Pictures from addresses that aren't safe to fetch are left alone.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
