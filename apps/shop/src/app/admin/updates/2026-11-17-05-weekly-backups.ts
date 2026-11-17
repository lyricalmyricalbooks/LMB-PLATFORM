import type { AppUpdate } from "../appUpdates";

export default {
  id: "weekly-backups",
  date: "2026-11-17",
  title: "Lighter backups, same safety",
  summary: "On a shop run by Colophon, the backup you can download is now made once a week instead of every night, and each one is still kept 30 days. Colophon backs up your whole shop every night as well, so nothing is less safe, and Back up now still makes a fresh copy whenever you want one. Making one copy a night instead of two lowers your monthly running cost.",
  links: [{ label: "Open Backups & export", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
