import type { AppUpdate } from "../appUpdates";

export default {
  id: "backup-code-email",
  date: "2026-11-03",
  title: "An email when a backup code is used",
  summary: "Whenever someone signs in with one of your two-step backup codes, you and the shop owner get an email saying so, with what to do if it wasn't you.",
  links: [{ label: "Open Security", tab: "settings", settingsTab: "security" }],
} satisfies AppUpdate;
