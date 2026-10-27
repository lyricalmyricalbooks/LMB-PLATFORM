import type { AppUpdate } from "../appUpdates";

export default {
  id: "photo-viewer-fits", date: "2026-10-15", title: "Book photos fit the screen and slide between each other",
  summary: "Clicking a book photo to enlarge it could open the viewer behind the shop header, with tall photos running off the bottom of the window. The viewer now always covers the whole screen, above the header, and the whole photo fits inside it. Moving to the next or previous photo, on the book page or in the viewer, now slides quickly from one photo to the next instead of flashing black, and the photos either side are loaded in advance. Its colours still follow Studio › Style › Product page · buy card & details › Enlarged photo viewer.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
