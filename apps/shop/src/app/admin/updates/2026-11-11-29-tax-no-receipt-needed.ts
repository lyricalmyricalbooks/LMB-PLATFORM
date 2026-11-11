import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-no-receipt-needed",
  date: "2026-11-11",
  title: "Tax centre: mark an expense as needing no receipt",
  summary: "Bank fees and other costs that never come with a receipt can now leave the Missing list. Press No receipt needed on the Tax centre's Receipts card. They move to a Not needed tab, where Needs one after all puts them back.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
