import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-coverage-related-recent-rows",
  date: "2026-10-12",
  title: "Studio: style the “From the Catalogue” and “Recently viewed” rows",
  summary:
    "The recommended-books row under a book and the Recently viewed row can now be clicked in the Studio preview and styled piece by piece: the whole row, its heading and line, the grid (including how many books sit across on desktop, tablet and phone) and the book photos. Each piece can also be hidden on any screen size. Clicking Recently viewed used to open the footer settings by mistake; it now opens its own controls. Find them in Studio › Theme settings › Advanced › Fine-tune single elements › Product details · content layout and Catalog & shared content · layout. Nothing changes on the live shop until you change a setting.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
