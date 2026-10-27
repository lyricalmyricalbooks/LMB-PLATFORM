import type { AppUpdate } from "../appUpdates";

export default {
  id: "backup-downloads", date: "2026-10-11", title: "Download any day's backup",
  summary: "Settings › General › Backups & export now lists every daily backup from the last 30 days, with whether it finished and how many records it holds. Press Download next to a day to save that whole day's database to your computer as one .json file. Backups made before this update have no download file; tonight's and later ones do, as soon as the updated Cloud Functions are deployed.",
  links: [{ label: "Open Backups & export", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
