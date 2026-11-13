import type { AppUpdate } from "../appUpdates";

export default {
  id: "imports-general-shops",
  date: "2026-11-13",
  title: "Imports fit shops that don't sell books",
  summary: "In a shop that sells clothing, jewellery, music or other things, products you import are now saved as that kind of product. Before, they came in as paperback books. A barcode that isn't an ISBN is kept as the product's barcode, and a second import of the same file finds each product by it, so nothing is added twice. The import window and its blank template no longer list book-only columns such as ISBN, Publisher and Pages, and its notes say product and variant. Book shops see no change, apart from one more column they can use: Barcode / UPC.",
  links: [{ label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
