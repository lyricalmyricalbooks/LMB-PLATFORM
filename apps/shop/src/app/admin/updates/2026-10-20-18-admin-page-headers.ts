import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-page-headers",
  date: "2026-10-20",
  title: "One tidy header on every admin page",
  summary: "Every admin page now opens the same way: one title, the page's sub tabs underlined right under it, its figures in one joined strip, then small filter chips. Orders no longer repeats its name three times (the Ship station, covers grid and table each show one short label), Reviews' Pending / Approved / Rejected / All are now sub tabs under the title, and the grey description line under each title is gone. Nothing about how the pages work has changed.",
  links: [
    { label: "Open Orders", tab: "orders" },
    { label: "Open Inventory", tab: "inventory" },
    { label: "Open Reviews", tab: "reviews" },
  ],
} satisfies AppUpdate;
