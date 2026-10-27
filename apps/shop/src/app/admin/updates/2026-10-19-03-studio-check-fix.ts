import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-check-fix",
  date: "2026-10-19",
  title: "Behind the scenes: Studio's automatic header check follows the new category links",
  summary: "The shop header's categories are now links rather than buttons, so Studio's built-in test that checks the header colours was updated to match. Nothing changes on the shop or in Studio.",
  links: [{ label: "Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
