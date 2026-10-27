import type { AppUpdate } from "../appUpdates";

export default {
  id: "related-by-artist",
  date: "2026-10-23",
  title: "Optional “More by this artist” on book pages",
  summary:
    "Like Shopify's “More from this vendor”, the related-books row under a book can now show the other books by the same artist, with the heading “More by <artist>”. Books whose artists have nothing else in the shop keep the usual row, and books where you picked the recommendations yourself keep your picks. It is off until you switch it on in Design › Theme settings › Book page · photos & layout › Extras on the page, so the live shop is unchanged. The heading words are in Text & labels › Product page.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
