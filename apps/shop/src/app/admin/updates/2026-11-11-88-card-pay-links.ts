import type { AppUpdate } from "../appUpdates";

export default {
  id: "card-pay-links",
  date: "2026-11-11",
  title: "Invoices can be paid by card",
  summary: "Open an invoice and press Card pay link to copy a link your customer pays by card, on your own payment account. When they pay, the invoice is marked paid the next time you open Invoices.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
