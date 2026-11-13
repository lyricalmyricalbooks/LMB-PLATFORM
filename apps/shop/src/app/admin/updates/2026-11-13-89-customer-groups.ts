import type { AppUpdate } from "../appUpdates";

export default {
  id: "customer-groups",
  date: "2026-11-13",
  title: "Save customer groups",
  summary: "On Customers, filter the list (for example returning customers on your newsletter in Toronto) and press Save as group. Next time, pick it from Saved groups. A group keeps the filters, not a fixed list, so it stays up to date as people order. Export CSV gives you the group as a spreadsheet.",
  links: [{ label: "Open Customers", tab: "customers" }],
} satisfies AppUpdate;
