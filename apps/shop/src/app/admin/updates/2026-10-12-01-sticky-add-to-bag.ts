import type { AppUpdate } from "../appUpdates";

export default {
  id: "sticky-add-to-bag",
  date: "2026-10-12",
  title: "Sticky “Add to bag” bar on book pages",
  summary:
    "Book pages can now show a slim bar at the bottom of the screen with the title, price and an Add to bag button once the main button has scrolled out of view, like most online shops. It is off by default and, when on, shows on phones only unless you change that. If an edition, add-on or gift-card detail still needs choosing, the bar takes the shopper back up to it. Turn it on in Studio › Theme settings › Product page · buy card & details › Sticky “Add to bag” bar. The button uses your Add to bag words.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
