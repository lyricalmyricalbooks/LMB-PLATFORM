import type { AppUpdate } from "../appUpdates";

export default {
  id: "lighter-admin-shell",
  date: "2026-11-11",
  title: "The admin opens faster",
  summary: "Every admin page now downloads about a quarter less before it shows. Books, Plan & billing, the bookkeeper's desk and the stockroom's sales and reorder lists load only when you open them, and an old orders list nothing showed any more was removed.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
