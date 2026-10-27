import type { AppUpdate } from "../appUpdates";

export default {
  id: "thumbnail-size",
  date: "2026-10-12",
  title: "Choose how big book photo thumbnails are",
  summary:
    "The small photo thumbnails on a book page were always 64px wide. A new Thumbnail size slider (40–160px) lets you make them bigger or smaller, which pairs well with showing them on several rows. Find it in Studio › Theme settings › Product page · buy card & details › Photo frame & thumbnails › Thumbnail size. It starts at 64px, so nothing changes until you move it.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
