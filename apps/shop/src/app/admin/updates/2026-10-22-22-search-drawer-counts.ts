import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-drawer-counts",
  date: "2026-10-22",
  title: "Choose how much the search drawer lists",
  summary: "Studio can now set how many books appear under “New in the shop” before a shopper types, how many artists and matching categories show while they type, and how many categories are suggested when nothing matches. Find them in Theme settings › Shop page heading & filters › Search, sort & in-stock bar. They start at today's numbers (4, 6, 6 and 8), so the shop looks the same until you change them.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
