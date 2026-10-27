import type { AppUpdate } from "../appUpdates";

export default {
  id: "catalog-import-google-feed", date: "2026-10-09", title: "Import books from a spreadsheet, and a Google Shopping feed",
  summary: "Books now has Import CSV: add new books or update many at once from Excel, Numbers or Google Sheets. Books are matched by ID, ISBN or SKU, and you see every change before anything is saved. Blank cells keep what's there, rows with problems are skipped and explained, and new books arrive as drafts selected for Publish, which still checks each one. Export CSV now has the same columns, so you can export, edit and import back. Books also has Google Shopping feed: an address to paste into Google Merchant Center so your books can appear on Google Shopping for free, with prices, sales, stock and pre-order dates kept in step with checkout. The feed file is created by the next site build after this update; tested with local checks only, not yet with Google.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
