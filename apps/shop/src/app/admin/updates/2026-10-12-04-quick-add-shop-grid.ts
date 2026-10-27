import type { AppUpdate } from "../appUpdates";

export default {
  id: "quick-add-shop-grid",
  date: "2026-10-12",
  title: "Quick add to bag from the shop grid",
  summary:
    "The shop grid can show an “Add to bag” button under each book, like Shopify's quick add. Books with several editions, extras or box sets show “Choose options” and open their page instead. It is off by default. Turn it on in Studio › Theme settings › Product cards & grid › Title & price › “Add to bag” button under each book; change the words in Text & labels › Product page. Prices and payment are still worked out by the server at checkout.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
