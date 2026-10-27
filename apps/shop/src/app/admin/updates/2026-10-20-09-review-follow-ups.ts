import type { AppUpdate } from "../appUpdates";

export default {
  id: "review-follow-ups",
  date: "2026-10-20",
  title: "Rich text HTML box is safe from toolbar clicks",
  summary: "In Design, a Rich text section's toolbar is now switched off while its HTML box is open, so a click on Bold or a list button can no longer overwrite the HTML you are typing.",
  links: [{ label: "Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
