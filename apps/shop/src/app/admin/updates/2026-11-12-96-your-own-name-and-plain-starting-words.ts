import type { AppUpdate } from "../appUpdates";

export default {
  id: "your-own-name-and-plain-starting-words",
  date: "2026-11-12",
  title: "A new shop opens under its own name, in plain words",
  summary: "A new shop now shows the name you gave at sign-up in its header, footer, browser tab and first banner picture, until you set another in Studio or Settings. Before, it showed a placeholder name. A shop that sells other things than books also starts with a plain banner, description and page title, and without the book menu. Anything you have already written stays as it is.",
  links: [{ label: "Open Design", tab: "design" }, { label: "Open Settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
