import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-test-harness", date: "2026-10-08", title: "Design studio is now tested in a real browser",
  summary: "Every change to the app now opens the Design studio in a test browser and checks the basics: the preview shows your unsaved work, adding a section, undo and redo, Save draft that never publishes, device sizes, Find anything and clicking a section to edit it. Nothing changes in how you use the studio.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
