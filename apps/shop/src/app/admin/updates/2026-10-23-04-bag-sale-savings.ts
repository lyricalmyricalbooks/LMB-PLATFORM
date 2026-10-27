import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-sale-savings",
  date: "2026-10-23",
  title: "Optional “You save” in the shopping bag",
  summary:
    "Like many Shopify carts, the shopping bag can now show what a sale saves: the regular price struck through beside a book on sale, “You save $6” under it, and a “You save” row above the total for the whole bag. It only shows for books on a sale you set in Books › edit › Pricing (books sold in editions and gift cards never show it), and it is display only: checkout still works out the real price. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Book rows › Sale savings, so the live shop is unchanged. The words are in Text & labels › Cart › Sale savings.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
