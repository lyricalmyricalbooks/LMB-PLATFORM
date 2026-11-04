import type { AppUpdate } from "../appUpdates";

export default {
  id: "past-order-file-name",
  date: "2026-11-03",
  title: "Each brought-over order says which file it came from",
  summary: "When you bring past orders over from several files, each order's page now says which file it came from, just above the button that takes that file back. So if one file turns out to be wrong, you can tell at a glance which orders it added before removing them. Orders brought over before this change don't show a file name.",
  links: [{ label: "Open Orders", tab: "orders" }],
} satisfies AppUpdate;
