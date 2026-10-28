import type { AppUpdate } from "../appUpdates";

export default {
  id: "order-fees",
  date: "2026-10-28",
  title: "Each card order remembers its fee and its payout",
  summary: "When a card order is paid, your shop now saves what Stripe or Square kept as its fee (and Colophon's share, if any) and what is left for you. When the money reaches your bank, the order also saves which payout it came in and the day it arrived. Refunds are counted too, including any fee that comes back. Nothing to do: this is what the coming bookkeeping reports will add up.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
