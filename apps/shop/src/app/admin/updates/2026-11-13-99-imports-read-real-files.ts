import type { AppUpdate } from "../appUpdates";

export default {
  id: "imports-read-real-files",
  date: "2026-11-13",
  title: "Bringing your old shop over reads more files, more carefully",
  summary: "We tested the import against product, order and customer files laid out the way the most popular shop systems really export them, and fixed what went wrong. Product codes written with a leading apostrophe now come over clean. Photos saved as older web addresses or as bare file names are found. Gift card products are left out and the preview says so. Hidden, draft and archived products are marked. Prices written the European way (1.250,00) read correctly, an ISBN in a product-code column is kept, and the preview tells you when prices are in another currency, when a sale was on one edition only, or when a photo could not be brought over. Order files now keep shipping and each item's price in two more layouts.",
  links: [{ label: "Open Products", tab: "catalog" }, { label: "Open Orders", tab: "orders" }, { label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
