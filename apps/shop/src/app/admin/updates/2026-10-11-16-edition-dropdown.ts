import type { AppUpdate } from "../appUpdates";

export default {
  id: "edition-dropdown",
  date: "2026-10-11",
  title: "Editions can be a drop-down the shopper must choose from",
  summary:
    "Book pages can now show editions (for example signed and unsigned) as a drop-down menu instead of buttons. Nothing is picked in advance, so shoppers have to choose before Add to bag works; if they forget, a short message asks them to choose. Turn it on in Studio › Theme settings › Product page · buy card & details › Edition picker. The words are in Text & labels › Product page.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
