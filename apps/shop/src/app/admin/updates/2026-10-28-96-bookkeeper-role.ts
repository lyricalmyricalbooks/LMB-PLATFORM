import type { AppUpdate } from "../appUpdates";

export default {
  id: "bookkeeper-role",
  date: "2026-10-28",
  title: "Invite your bookkeeper",
  summary: "Settings › Team has a new Bookkeeper role. Your bookkeeper signs in with their own Google account and sees one page: sales, tax and shipping collected for a month or year, whether payouts are on, and spreadsheets of the orders and daily sales. They can't change anything, and they don't see your books, settings, customer list or team. In the stockroom they see the tax centre's expenses, read only.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
