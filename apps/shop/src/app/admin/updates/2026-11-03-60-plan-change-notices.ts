import type { AppUpdate } from "../appUpdates";

export default {
  id: "plan-change-notices",
  date: "2026-11-03",
  title: "The admin tells you when an app is being added or is closing",
  summary: "When you add the stockroom or the website to your plan, a note at the top of the admin says it's being set up, and we email you the link when it's ready. When you drop one, the note gives the day it closes; until then everything works as usual. Settings, Plan shows the same.",
  links: [{ label: "Open Plan", tab: "settings", settingsTab: "plan" }],
} satisfies AppUpdate;
