import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-ships-by",
  date: "2026-10-22",
  title: "Optional “ships by” date on book pages",
  summary:
    "Like Shopify's delivery-date messages, book pages can now say “Order now — ships by Monday, Oct 26” under the buy buttons, and “Order within 2h 15m” in the last hours before your daily cut-off. You choose how many working days you need, the cut-off hour (Toronto time) and any days you won't be sending orders (holidays, time away); weekends are always skipped. It shows only for printed books in stock (not e-books, gift cards, pre-orders, backorders or sold-out books) and never changes an order. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page › Ships-by line. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
