import type { AppUpdate } from "../appUpdates";

export default {
  id: "buy-it-now-button",
  date: "2026-10-12",
  title: "“Buy it now” button on book pages",
  summary:
    "Book pages can show a second button under Add to bag that puts the chosen edition in the bag and opens checkout straight away, like Shopify's Buy it now. It is off by default. Turn it on in Studio › Theme settings › Product page · buy card & details › Title, price & stock › “Buy it now” button; change its words in Text & labels › Product page. Prices and payment are still worked out by the server at checkout.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
