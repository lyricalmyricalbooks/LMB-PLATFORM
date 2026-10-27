import type { AppUpdate } from "../appUpdates";

export default {
  id: "photo-enlarge",
  date: "2026-10-13",
  title: "Product page: click a photo to enlarge it",
  summary: "Shoppers can now open a book's photos full-screen from an Enlarge button on the product page, then move through them with arrow keys, the arrow buttons or Escape to close. Turn it off in Studio › Theme settings › Shop & book pages › Product photos (“Click photo to enlarge”); change its screen-reader words in Text & labels › Product page.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
