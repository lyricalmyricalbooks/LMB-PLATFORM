import type { AppUpdate } from "../appUpdates";

export default {
  id: "header-offset-book-page",
  date: "2026-10-22",
  title: "The header no longer hides the top of the buy box",
  summary:
    "On a computer, scrolling a book page made the buy box stop under the shop header, so its top edge and the category tag were cut off. The buy box now stops just below the header, whatever its height: two rows of menu links, a menu that wraps onto a third row, or an announcement bar above it. Links that jump down the page (like reviews) also land below the header now.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
