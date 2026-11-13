import type { AppUpdate } from "../appUpdates";

export default {
  id: "reports-bills",
  date: "2026-11-13",
  title: "Bills to pay on the balance sheet and cash forecast",
  summary: "Bookkeeping › Reports now counts your supplier bills. Bills you haven't paid show on the balance sheet as money you owe, and the 90-day cash forecast takes each one out on its due day. Invoices your repeating schedules will make also come in on their payment days, so the forecast shows money you're expecting, not just invoices already sent.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
