import type { AppUpdate } from "../appUpdates";

export default {
  id: "artist-bio-tab",
  date: "2026-10-22",
  title: "Artist bio tab and ruled text on book pages",
  summary: "Books › edit › Details has a new Artist bio box. Fill it in and that book's page gets an Artist bio tab next to Description and Details. Studio › Style › Book page · buy box & details can also draw ruled lines between paragraphs in the tabs. Both are off or empty until you use them.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
