import type { AppUpdate } from "../appUpdates";

export default {
  id: "thumbnail-strip-fill",
  date: "2026-10-16",
  title: "Book page thumbnails fill the whole box",
  summary: "The row of small pictures under a book's main photo used to leave empty space at the right edge. The thumbnails now size themselves so every row reaches both edges, with or without several rows, and rows are balanced (14 photos make two rows of 7 rather than 8 and 6). New controls in Studio › Theme settings › Book page · photos & layout › Photo frame & thumbnails: Stretch thumbnails to fill the width, Thumbnails per row, Short last row of thumbnails, Gap between thumbnails and Thumbnail shape.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
