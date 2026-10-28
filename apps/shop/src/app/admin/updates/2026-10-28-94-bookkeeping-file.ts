import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookkeeping-file",
  date: "2026-10-28",
  title: "A month of sales, ready for your bookkeeper",
  summary: "Each tax rate now has a name in your books, like GST, HST ON or PST BC. Presets fill it in and you can change it in Taxes. New orders keep their tax under that name. Backups & export can now download any month as three sheets: one line per day (sales, shipping, discounts, gift cards, refunds, each tax, card fees and net), one per order and one per payout. Test and practice orders are left out. Card fees and payouts fill in once your payment service reports them.",
  links: [
    { label: "Open Taxes", tab: "settings", settingsTab: "taxes" },
    { label: "Open Backups & export", tab: "settings", settingsTab: "general" },
  ],
} satisfies AppUpdate;
