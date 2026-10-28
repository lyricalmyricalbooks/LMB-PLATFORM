import type { AppUpdate } from "../appUpdates";

export default {
  id: "imported-photos-kept",
  date: "2026-10-28",
  title: "Imported photos move into your shop",
  summary: "Book photos you brought over from your old shop used to load from the old shop's address, so they would disappear if that shop closed. Your shop now copies them into its own storage by itself, usually within an hour of the import, and the books switch to the copies. Nothing changes on the page, and the old address is kept on each photo for reference. If a photo can't be fetched (the old shop removed it, say), the book keeps its old photo and your shop tries again a week later. Each batch it copies is noted in your activity log.",
  links: [
    { label: "Books", tab: "catalog" },
  ],
} satisfies AppUpdate;
