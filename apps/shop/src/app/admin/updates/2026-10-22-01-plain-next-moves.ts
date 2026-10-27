import type { AppUpdate } from "../appUpdates";

export default {
  id: "plain-next-moves",
  date: "2026-10-22",
  title: "Suggestions after each change are written in plain words",
  summary: "Maintenance only: the instructions Claude follows in this project now ask for its end-of-change suggestions to be written for you, not for a developer, the same way the inventory app already does. Each suggestion says what to do and why it matters to the shop in full sentences, with any technical names kept to the end. Nothing in the shop or the admin changes.",
  links: [{ label: "Overview", tab: "overview" }],
} satisfies AppUpdate;
