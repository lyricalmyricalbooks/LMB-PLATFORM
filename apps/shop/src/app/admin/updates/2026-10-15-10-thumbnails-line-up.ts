import type { AppUpdate } from "../appUpdates";

export default {
  id: "thumbnails-line-up", date: "2026-10-15", title: "Book photo thumbnails line up with the main photo",
  summary: "When thumbnails are set to sit on several rows, they now fill the exact width of the main photo, with even gaps, on phones and computers. Before, a few fixed-size thumbnails sat to the left and left an empty strip on the right. The thumbnail size you set in Studio is now the smallest a thumbnail can be: as many as fit go on each row and stretch to fill it.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
