import type { AppUpdate } from "../appUpdates";

export default {
  id: "faster-checks-fix",
  date: "2026-10-20",
  title: "Fix for the split Design studio control check",
  summary: "Maintenance only: two of the four machines that check every Design studio control stopped with a script error after the checks were split. They now run their share again. Nothing in the admin or the shop looks different.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
