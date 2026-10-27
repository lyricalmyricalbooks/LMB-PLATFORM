import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-fills-window",
  date: "2026-10-14",
  title: "No more black band under admin pages",
  summary: "The admin now always fills the whole window. Before, scrolling could push the sidebar and page up and leave a black strip along the bottom of the screen; the cream background now reaches the bottom on every admin page.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
