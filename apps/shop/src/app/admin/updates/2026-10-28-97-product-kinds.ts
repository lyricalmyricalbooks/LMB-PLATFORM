import type { AppUpdate } from "../appUpdates";

export default {
  id: "product-kinds",
  date: "2026-10-28",
  title: "Products that aren't books, with a size guide",
  summary: "Product type now lets you say what a product is: a book, clothing, shoes, jewelry, art or a print, music, or something else. For anything that isn't a book, the editor swaps the book fields (author, ISBN, pages, publisher) for brand or maker, material and care, and the product page shows only those. A size guide (words, a picture or both) adds a Size guide tab to the product page, which you can turn off or move in Design › Style › Product page. Books keep every field and look exactly as before.",
  links: [{ label: "Open your books", tab: "catalog" }],
} satisfies AppUpdate;
