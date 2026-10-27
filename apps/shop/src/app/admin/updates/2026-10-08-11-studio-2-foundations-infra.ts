import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-foundations-infra", date: "2026-10-08", title: "Design studio opens faster",
  summary: "The Design studio now loads only when you open it, so the rest of the admin starts quicker. Every change to the app is now automatically tested before it can ship. This is the first step of a larger Design studio upgrade.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
