import type { AppUpdate } from "../appUpdates";

export default {
  id: "pdp-in-bag",
  date: "2026-10-23",
  title: "Optional “already in your bag” line on book pages",
  summary:
    "Like Shopify themes' “in cart” note, a book page can now tell shoppers “2 copies already in your bag · View bag” under the buy buttons when the edition they are looking at is already in their bag, so nobody buys a second copy by accident. The link opens the bag. It only reads the shopper's own bag and changes nothing about prices or checkout. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
