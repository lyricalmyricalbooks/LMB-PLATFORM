import type { AppUpdate } from "../appUpdates";

export default {
  id: "unused-files-check",
  date: "2026-11-11",
  title: "Leftover code can't pile up again",
  summary: "Every update to the admin is now checked for code no page uses, and an update that leaves some behind is stopped before it goes out. This keeps the admin small and quick to load.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
