import type { AppUpdate } from "../appUpdates";

export default {
  id: "smarter-search", date: "2026-10-09", title: "Smarter shop search",
  summary: "Shoppers' search now works more like Shopify's. Every word they type has to match, in any order (\"tolkien hobbit\"), accents are ignored, ISBNs are found with or without hyphens, and a small typo in a longer word (\"hobbbit\") still finds the book. Titles starting with the search rank first. In the search pop-up, the arrow keys move through results and Enter opens the highlighted one. The pop-up and the shop page search box now share one matcher, so they always agree. No new settings: the number of results is still Studio › Style › Search pop-up. Tested with local checks only.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
