import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-console-old-links",
  date: "2026-10-15",
  title: "Old Big Cartel links no longer look like broken pages to Google",
  summary:
    "Google Search Console flagged old Big Cartel book links as soft 404s because any unknown one opened Publications. Now each old book link that still has a book here forwards straight to it in one permanent step (including /product/collective-photobook), and old links for books that aren't in the shop any more answer \"not found\" instead of opening a list. /cart opens the shop with your bag showing and is kept out of search results. The Books, Zines and Publications pages now have one main heading and a short introduction; change the introductions in Studio › Text & labels › Collection & wishlist pages, or give a category its own description in Studio › Navigation › Shop categories.",
  links: [{ label: "Open Studio (Settings › Design)", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
