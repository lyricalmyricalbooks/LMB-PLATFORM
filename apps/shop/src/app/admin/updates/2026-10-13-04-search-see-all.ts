import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-see-all",
  date: "2026-10-13",
  title: "Search pop-up: “See all results” link",
  summary: "When more books match a search than the pop-up shows, a “See all N results” link now opens the shop's All view with those words already searched, where shoppers can sort and filter. Turn it off in Studio › Theme settings › Catalog page header & filters; change its words in Text & labels › Search & filters.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
