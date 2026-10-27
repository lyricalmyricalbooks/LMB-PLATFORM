import type { AppUpdate } from "../appUpdates";

export default {
  id: "empty-bag-picks",
  date: "2026-10-23",
  title: "Optional book suggestions in an empty bag",
  summary:
    "Like many Shopify carts, an empty shopping bag can now suggest a few books instead of only saying it is empty: your featured books first, then the newest, each with its photo, price and an Add to bag button (the title opens the book page). Only books that can be bought right now are offered. It is off until you switch it on in Design › Theme settings › Cart drawer (shopping bag) › Empty bag › Suggest books in an empty bag, where you can also choose how many (1 to 4), so the live shop is unchanged. The words are in Text & labels › Cart.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
