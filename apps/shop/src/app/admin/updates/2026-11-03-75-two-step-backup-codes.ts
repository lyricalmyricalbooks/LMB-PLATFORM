import type { AppUpdate } from "../appUpdates";

export default {
  id: "two-step-backup-codes",
  date: "2026-11-03",
  title: "Backup codes if you lose your phone",
  summary: "When you turn on two-step sign-in, you now get ten backup codes to print or save. If your phone is lost, choose \"Lost your phone?\" at sign-in and type one: you're in, and Security asks you to set up your new phone. Owners on a paid plan also see a reminder on the home page until two-step is on.",
  links: [{ label: "Open Security", tab: "settings", settingsTab: "security" }],
} satisfies AppUpdate;
