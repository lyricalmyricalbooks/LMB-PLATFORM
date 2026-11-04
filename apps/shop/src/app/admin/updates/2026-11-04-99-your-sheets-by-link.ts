import type { AppUpdate } from "../appUpdates";

export default {
  id: "your-sheets-by-link",
  date: "2026-11-04",
  title: "Bring a Google Sheet in by its link",
  summary: "Every window that brings a file in now has a Google Sheet button: paste the sheet's link and it comes in like a file, with its other tabs to choose from. It uses your shop's Google sign-in, so there is nothing to download or share first.",
  links: [{ label: "Open Books", tab: "catalog" }, { label: "Open Google settings", tab: "settings", settingsTab: "google" }],
} satisfies AppUpdate;
