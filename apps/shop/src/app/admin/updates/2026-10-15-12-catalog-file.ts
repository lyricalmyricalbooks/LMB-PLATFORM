import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-file",
  date: "2026-10-15",
  title: "The shop reads its catalog from a file instead of the database",
  summary: "Every new visitor used to read all published books, the shop settings and your pages from the database, and each document read is billed. The site build now saves those as one file that loads from the website's own servers, and visitors' browsers check a single small record to confirm nothing has changed since. If anything changed (a sale, an edit, a publish), browsers read the database exactly as before until the next site refresh, so shoppers always see the same, up-to-date shop. Checkout still checks prices and stock on the server. This needs the next Firebase and storefront deploys; local tests don't prove the live saving.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
