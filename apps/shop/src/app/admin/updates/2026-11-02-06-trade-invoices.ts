import type { AppUpdate } from "../appUpdates";

export default {
  id: "trade-invoices",
  date: "2026-11-02",
  title: "Let trade accounts order now and pay within 30 days",
  summary: "In Customers › Trade accounts you can now choose how each shop pays: by card at checkout, or by invoice with 15, 30 or 60 days to pay. A shop on invoice terms sees \"Pay by invoice\" when it signs in at checkout, and its order is priced at your wholesale prices and counted as a sale straight away. The order page shows when the invoice is due and has a button to record the payment once it arrives, and an alert appears on every admin page when an invoice goes past its due date.",
  links: [{ label: "Open trade accounts", tab: "customers" }, { label: "Open orders", tab: "orders" }],
} satisfies AppUpdate;
