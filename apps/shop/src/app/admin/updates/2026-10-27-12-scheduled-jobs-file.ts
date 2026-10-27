import type { AppUpdate } from "../appUpdates";

export default {
  id: "scheduled-jobs-file",
  date: "2026-10-27",
  title: "Timed emails and sweeps have their own file",
  summary: "Behind the scenes, the jobs the server runs on a timer (the daily orders-needing-you email, the weekly summary, abandoned bag reminders, the back-in-stock catch-up and the sweep that makes smaller copies of older photos) moved into a file of their own. They run on the same schedule and send the same emails as before.",
  links: [{ label: "Open email settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
