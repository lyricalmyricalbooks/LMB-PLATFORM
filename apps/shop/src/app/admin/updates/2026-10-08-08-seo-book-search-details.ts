import type { AppUpdate } from "../appUpdates";

export default {
  id: "seo-book-search-details", date: "2026-10-08", title: "Richer Google listings for your books",
  summary: "Book pages now tell Google each edition's format, page count, publication date, edition name and ISBN (as a barcode number, only when the ISBN is valid), and the alt text you write for book photos is now used on the product page, which helps Google Images. Search snippets end on a whole word, Google may show your covers as large previews, and Pinterest/Facebook shares carry the price and stock. Nothing is invented: blank catalog fields are simply left out. The new details reach Google after the next site build and crawl.",
  links: [{ label: "Fill in book details and photo alt text", tab: "catalog" }],
} satisfies AppUpdate;
