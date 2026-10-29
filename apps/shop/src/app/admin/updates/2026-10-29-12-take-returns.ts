import type { AppUpdate } from "../appUpdates";

export default {
  id: "take-returns",
  date: "2026-10-29",
  title: "Choose whether you take returns",
  summary: "A new Returns tab under Shipping lets you decide whether shoppers may ask for a return, and for how many days after delivery. It is off unless you switch it on. When it's on, an order that has shipped shows Ask for a return on its page until the time is up. Each request comes to you in Orders under Needs me with an email, where you approve or decline it, give return instructions, check what came back, then refund or swap for another size. Nothing is refunded or put back on the shelf until you do.",
  links: [{ label: "Open Returns", tab: "settings", settingsTab: "shipping" }],
} satisfies AppUpdate;
