import type { AppUpdate } from "../appUpdates";

export default {
  id: "google-leaves-cleanly",
  date: "2026-11-12",
  title: "Your web address is handed back when a shop is deleted",
  summary: "If a shop is ever deleted, after the download period and both warning emails, its own web address now comes off Colophon too, so it is free to point somewhere else. Google's checks for your web address also go in through the same place as your other address settings.",
  links: [{ label: "Open Google", tab: "settings", settingsTab: "google" }],
} satisfies AppUpdate;
