import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-ship-by",
  date: "2026-10-23",
  title: "Optional “ships by” date in the shopping bag",
  summary:
    "Like Shopify's delivery-date apps, the shopping bag can now say “Order now — ships by Monday, Oct 26” above the total, with a countdown near your daily cut-off. It uses the same working days, cut-off hour and closed days you set for the book page's Ships-by line, and only shows when every printed book in the bag is in stock (never for pre-orders, backorders, Coming soon books or box sets; e-books are ignored). It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Total & checkout button, so the live shop is unchanged. The words are in Text & labels › Cart. It is a promise shown to shoppers only; it never changes an order.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
