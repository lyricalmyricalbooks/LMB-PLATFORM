import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-sale-countdown",
  date: "2026-10-22",
  title: "Optional sale countdown on book pages",
  summary:
    "Like Shopify themes' countdown timer, a book on sale with an end date (Books › edit › Pricing › Sale ends) can now count down in its last hours: “Sale ends in 5h 12m” replaces “Sale ends October 31”, updating as shoppers watch, and disappears once the sale is over. It counts down to the real end of the sale (midnight Toronto time after the last day), never a made-up deadline. You choose how many hours before the end it starts (72 by default). It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
