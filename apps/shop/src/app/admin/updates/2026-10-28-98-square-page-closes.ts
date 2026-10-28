import type { AppUpdate } from "../appUpdates";

export default {
  id: "square-page-closes",
  date: "2026-10-28",
  title: "Square's payment page closes when the books stop being set aside",
  summary: "If your shop takes cards through Square, the payment page now closes when the 30-minute hold on the shopper's books ends, so two people can't both pay for your last copy. If a payment still gets through after that, the shop doesn't mark the order paid or take the books from your stock: it refunds the shopper in full straight away and sends them your Order refunded email with a short note saying why. Each order's activity shows what happened.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
