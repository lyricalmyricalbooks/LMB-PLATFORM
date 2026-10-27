import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-real-addresses",
  date: "2026-10-27",
  title: "Sample emails use a made-up address",
  summary: "The sample order used to preview your email templates now uses a made-up customer address instead of one that could belong to a real person. Nothing changes in the emails your customers receive.",
  links: [{ label: "Open email settings", tab: "settings", settingsTab: "notifications" }],
} satisfies AppUpdate;
