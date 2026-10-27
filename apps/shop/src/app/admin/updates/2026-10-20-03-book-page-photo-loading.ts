import type { AppUpdate } from "../appUpdates";

export default {
  id: "book-page-photo-loading",
  date: "2026-10-20",
  title: "Book pages no longer download every photo a shopper hasn't looked at",
  summary: "When a book page finished loading on a phone, it quietly downloaded every gallery photo at full size, plus the related-book covers further down, even if the shopper never swiped. Now only the photo shown and the ones either side load straight away; the rest load when the shopper reaches for the gallery or scrolls to them. In our test on a sample book this cut the photos downloaded in the first seconds from about 3.4 MB to about 1.3 MB. The thumbnails under the photo also keep the same layout while the page loads instead of jumping from 5 to 3 a row. Nothing changes in how the page looks.",
  links: [{ label: "Books", tab: "catalog" }],
} satisfies AppUpdate;
