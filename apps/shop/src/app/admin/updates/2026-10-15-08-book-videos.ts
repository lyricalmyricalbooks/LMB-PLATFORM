import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-videos", date: "2026-10-15", title: "Add videos to a book",
  summary: "Books › edit › Images has an Add video button (or drop the file onto the images). Videos (MP4, WebM or MOV, up to 50 MB each, five per book) sit among the photos, so you can drag them into any position, and they play on the book page and in the enlarged viewer. Shop cards, search results and emails show a still frame from the video. Videos only download when a shopper presses play. Studio › Style › Product page › Show book videos hides them without deleting them.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
