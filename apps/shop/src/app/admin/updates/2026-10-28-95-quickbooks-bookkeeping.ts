import type { AppUpdate } from "../appUpdates";

export default {
  id: "quickbooks-bookkeeping",
  date: "2026-10-28",
  title: "Send your sales to QuickBooks from Settings › Bookkeeping",
  summary: "Once Colophon turns the QuickBooks link on for your shop, Settings › Bookkeeping connects your QuickBooks company in three steps: sign in with Intuit, choose one line per day or every order, and match your taxes. Each night after that, the day's sales, refunds, card fees and payouts go to QuickBooks once. The page shows the last day sent, lets you send a day again, and lets you disconnect. Until the link is turned on, the page stays hidden.",
  links: [{ label: "Open Bookkeeping", tab: "settings", settingsTab: "bookkeeping" }],
} satisfies AppUpdate;
