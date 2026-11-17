import type { AppUpdate } from "../appUpdates";

export default {
  id: "settings-polish-3",
  date: "2026-11-17",
  title: "Shorter help on the Taxes page",
  summary: "The Taxes page reads faster. The GST/HST question has a two-line hint, the duties card says what it does in one line, and the long preset explanation is folded under What this fills in.",
  links: [{ label: "Taxes", tab: "settings", settingsTab: "taxes" }],
} satisfies AppUpdate;
