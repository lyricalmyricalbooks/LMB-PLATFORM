import type { AppUpdate } from "../appUpdates";

export default {
  id: "download-closed-app",
  date: "2026-11-03",
  title: "Download a closed app's records from your Plan page",
  summary: "When you've dropped your stockroom or website and it has closed, Settings, Plan now says until when its records are kept and has a Download all your data button. We email you a link to every file, the same copy as on your account page.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
