import type { AppUpdate } from "../appUpdates";

export default {
  id: "broken-photo-links",
  date: "2026-11-03",
  title: "Photos that no longer load are left out when you bring books over",
  summary: "When you bring books from your old shop, the preview now checks that each photo can still be loaded. Any that can't are left out, and each book it affects says so, so no book arrives with a blank picture. You can add new photos in the book editor.",
  links: [{ label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
