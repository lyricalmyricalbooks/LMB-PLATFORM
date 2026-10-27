import type { AppUpdate } from "../appUpdates";

export default {
  id: "added-to-bag-notice",
  date: "2026-10-22",
  title: "Optional “Added to your bag” notice",
  summary:
    "Like Shopify themes' cart notification, adding a book can now show a small card in the corner of the page (the book, how many copies, the price, and View bag / Check out / Continue shopping) instead of sliding the whole bag open, so shoppers keep browsing. It closes by itself after a few seconds (you choose how many, or 0 to keep it until closed) and never while the shopper is pointing at it. It uses the bag's own colours, fonts and button style. It is off until you choose it in Design › Theme settings › Cart drawer (shopping bag) › After adding a book, so the live shop still opens the bag. The words are in Text & labels › Cart.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
