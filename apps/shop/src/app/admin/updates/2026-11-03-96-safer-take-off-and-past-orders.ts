import type { AppUpdate } from "../appUpdates";

export default {
  id: "safer-take-off-and-past-orders",
  date: "2026-11-03",
  title: "Safer refunds when taking items off, and past orders stay history",
  summary: "Take items off this order now fills the refund in the currency the customer paid in, and it can no longer refund and cancel the whole order by mistake when nothing is ticked or the amount box is empty. Past orders brought over from your old shop no longer offer a refund or a second confirmation email: refund those in your old shop.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
