import type { AppUpdate } from "../appUpdates";

export default {
  id: "release-note-check",
  date: "2026-10-15",
  title: "Release notes check repaired",
  summary: "Maintenance only: fixed a release note whose label didn't match its file, which made the shop's automatic checks fail. Nothing changes in the shop or Studio.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
