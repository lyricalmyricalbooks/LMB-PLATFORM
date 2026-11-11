import type { AppUpdate } from "../appUpdates";

export default {
  id: "redesign-match-stockroom",
  date: "2026-11-11",
  title: "Closer to the redesign: the stockroom's Sales, Stockists and Expenses",
  summary: "Sales records now open with channel pills, a takings tile, copies sold and your best channel, with Download CSV and Record a sale at the top; each sale shows its channel as a coloured chip. Buyers in person, Parcels, Stockists and Expenses are each one simple table, as in the redesign. Parcels lists who each parcel goes to and how long it has waited, and a short line under it names any parcel that cost more to post than the customer paid. Stockists shows copies, sold and owed per shop, with a chip when an invoice is overdue. Expenses marks each cost Receipt or No receipt, and a line under it says what is still owed back to authors. The figure tiles and filter rows on these pages are gone; search appears once a list gets long.",
  links: [{ label: "Open Inventory", tab: "inventory" }],
} satisfies AppUpdate;
