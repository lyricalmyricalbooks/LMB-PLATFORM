import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-free-shipping",
  date: "2026-10-22",
  title: "Optional free-shipping line on book pages",
  summary:
    "Like Shopify themes' free-shipping message, book pages can now say “Free shipping on orders over CA$75” under the buy buttons. When the bag already has printed books it changes to “Add CA$24 more for free shipping”, then “Your order ships free”. It uses the same free-shipping amount as the bag's progress bar (Settings › Shipping), counts printed books only and never shows for e-books, gift cards or sold-out books. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Shipping settings", tab: "settings", settingsTab: "shipping" },
  ],
} satisfies AppUpdate;
