import type { AppUpdate } from "../appUpdates";

export default {
  id: "fee-from-control-room",
  date: "2026-11-12",
  title: "Plan page shows the current Colophon fee",
  summary: "The monthly fee on your Plan page now always matches the one Colophon charges new shops.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
