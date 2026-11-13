import type { AppUpdate } from "../appUpdates";

export default {
  id: "download-limit",
  date: "2026-11-13",
  title: "Choose how often buyers can download",
  summary: "Settings › General › Shop status & checkout has a new Digital downloads box. Set how many times a buyer can download each file they bought, from 1 to 100. The order email tells them the number you chose. It stays at 10 until you change it.",
  links: [{ label: "Open the setting", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
