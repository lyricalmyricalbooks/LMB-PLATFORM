import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-sales-list-and-one-home",
  date: "2026-11-03",
  title: "Every sale in one list, and one Home",
  summary: "If you have both the website and the stockroom, Orders › All sales now lists every sale together: website orders beside fair, stockist, invoice and hand-entered sales, with a button per channel and the totals for each. Sales the stockroom took online itself, such as payment links, show as Other online sales. Home's Needs you list also counts the stockroom's to-dos (payments to chase, orders still to post, stock counts to check), each with a button that opens it.",
  links: [{ label: "Open Orders", tab: "orders" }, { label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
