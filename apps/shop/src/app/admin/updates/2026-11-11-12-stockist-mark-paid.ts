import type { AppUpdate } from "../appUpdates";

export default {
  id: "stockist-mark-paid",
  date: "2026-11-11",
  title: "Mark a stockist's invoice paid",
  summary: "Stockists › open a stockist › Mark paid on a sent invoice. It clears what they owed, the same way the stockroom does, and keeps anything another device saved meanwhile. Tick the box to email them a receipt from your shop's address; nothing is sent unless you do. Invoices in another currency still need the stockroom, which asks for the rate.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
