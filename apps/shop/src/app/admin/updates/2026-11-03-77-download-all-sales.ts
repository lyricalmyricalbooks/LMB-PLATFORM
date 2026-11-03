import type { AppUpdate } from "../appUpdates";

export default {
  id: "download-all-sales",
  date: "2026-11-03",
  title: "Download every sale as a spreadsheet",
  summary: "If you have both the website and the stockroom, Orders › All sales now has a Download spreadsheet button. It saves exactly the list you're looking at, for the period and channel you picked, with every sale in its own currency. Hand it to your accountant or keep it with your books.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
