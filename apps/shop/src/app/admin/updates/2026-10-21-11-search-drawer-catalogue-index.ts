import type { AppUpdate } from "../appUpdates";

export default {
  id: "search-drawer-catalogue-index",
  date: "2026-10-21",
  title: "New search: a full-width drawer that reads like the catalogue",
  summary: "Search now opens as a drawer across the top of the shop with the typing line in big poster type. Before typing it shows the four newest books, every shop category with its book count, recent and popular searches. While typing, matches sit in three columns (Books with cover, artist, format, stock and price; Artists; Categories) with the typed letters marked in red. Arrow keys move, Enter opens, Esc closes, and a search that finds nothing suggests categories. On phones it fills the screen. Every word is in Studio › Text & labels › Search & filters, and each part can be hidden in Theme settings › Search · layout & elements.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer" }],
} satisfies AppUpdate;
