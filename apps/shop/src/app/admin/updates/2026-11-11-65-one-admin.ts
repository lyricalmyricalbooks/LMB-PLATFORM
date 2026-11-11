import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-admin",
  date: "2026-11-11",
  title: "The old stockroom app no longer runs behind the admin",
  summary: "Every stockroom page is now drawn by the admin itself. The book page's stock and sales, the match for a new item, All sales, Home's to-dos and today at the fair all read your stockroom records directly, so they open faster and no old screens show through.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
