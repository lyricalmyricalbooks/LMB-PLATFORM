import type { AppUpdate } from "../appUpdates";

export default {
  id: "crop-book-photos",
  date: "2026-10-15",
  title: "Crop and position book photos",
  summary: "Each book image now has Crop & position under Books › edit › Images. Drag the photo to choose what stays in view, zoom in to crop its edges, and preview it in the shop card and book page shapes before you press Apply. Your uploaded file is never changed, so Reset brings back the whole photo. Save the book to put the change live.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
