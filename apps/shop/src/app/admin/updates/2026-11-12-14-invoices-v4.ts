import type { AppUpdate } from "../appUpdates";

export default {
  id: "invoices-v4",
  date: "2026-11-12",
  title: "Invoices at a glance",
  summary: "Invoices now opens with what's outstanding, what's overdue and what's been paid in the last 30 days. Filter by Draft, Sent, Overdue or Paid, and mark an invoice sent or paid straight from its row.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
