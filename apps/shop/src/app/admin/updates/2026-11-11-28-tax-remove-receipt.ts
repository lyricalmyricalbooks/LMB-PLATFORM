import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-remove-receipt",
  date: "2026-11-11",
  title: "Tax centre: take off a wrong receipt",
  summary: "Attached the wrong photo? On the Tax centre's Receipts card, each receipt on an expense now has a Remove button. It asks first, then takes that receipt off the expense. The expense itself stays in your ledger.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
