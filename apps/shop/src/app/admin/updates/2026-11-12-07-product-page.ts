import type { AppUpdate } from "../appUpdates";

export default {
  id: "product-page",
  date: "2026-11-12",
  title: "Editing a product is one page now",
  summary: "Opening a product shows it as its own page instead of a panel over the list. Everything that used to sit on ten tabs is on one Details page, one part under another: details, photos, price, stock, versions, categories, visibility and the search listing. A green tile on the right shows what you keep on each sale, and one bar at the bottom says what is left and saves. Stock and sales has its own tab when your stockroom is part of the admin.",
  links: [{ label: "Open Products", tab: "catalog" }],
} satisfies AppUpdate;
