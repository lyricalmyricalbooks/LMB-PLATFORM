import type { AppUpdate } from "../appUpdates";

export default {
  id: "tax-centre-bookkeeping",
  date: "2026-11-12",
  title: "Tax centre and Bookkeeping, redesigned",
  summary: "The Tax centre is now one page: what you collected, what you owe, past filings, when the next return is due and the tax-season file, with a year switcher, Mark period filed and Download tax summary at the top. Bookkeeping has five tabs: Overview (profit and loss, where the money goes, cash flow, spreadsheets), Transactions (payouts and the ledger), Expenses, Receipts (drop a receipt photo to log it) and Artist payouts for book shops. Every figure and saved record is the same as before.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
