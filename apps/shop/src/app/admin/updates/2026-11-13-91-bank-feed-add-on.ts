import type { AppUpdate } from "../appUpdates";

export default {
  id: "bank-feed-add-on",
  date: "2026-11-13",
  title: "Bank feed with Plaid (beta add-on)",
  summary: "Settings › Plan has a new Add-ons card with the bank feed, marked Beta. Add it, then connect your bank with Plaid under Bookkeeping › Transactions: you sign in at your bank in Plaid's secure window, and it can only read transactions, never move money. Each bank transaction then waits under To review with what it most likely is (a card payout, an expense you already logged, or a new expense under your sorting rules), and you confirm it with one tap. You're billed only after a calendar month in which a bank was connected, nothing during the free trial, and turning it off disconnects your banks at once. The cards say Opening soon until Colophon has opened it for shops.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }, { label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
