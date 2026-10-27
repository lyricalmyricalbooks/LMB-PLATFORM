import type { AppUpdate } from "../appUpdates";

export default {
  id: "backups-robust", date: "2026-10-11", title: "Backups work without the missing Google permission",
  summary: "The nightly backup used to fail completely because Google refused the full Firestore export (the Functions account is missing the Cloud Datastore Import Export Admin role). Each backup now also saves its own copy of every document to your storage bucket, which needs no extra permission, so you keep a complete nightly backup either way. Settings › General › Backups & export has a Back up now button and step-by-step instructions to switch the full export back on. This starts working once the updated Cloud Functions are deployed.",
  links: [{ label: "Open Backups & export", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
