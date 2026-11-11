import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-attach-receipt",
  date: "2026-11-11",
  title: "Tax centre: attach a receipt to an expense",
  summary: "An expense in the Tax centre's ledger without a receipt now has an Attach receipt button. Pick a photo or PDF (on a phone you can take the picture there and then) and it is kept with that expense, ready for your accountant. Expenses that already have one show a Receipt link.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
