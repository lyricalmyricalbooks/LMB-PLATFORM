import type { AppUpdate } from "../appUpdates";

export default {
  id: "no-cancelled-runs",
  date: "2026-10-12",
  title: "Fewer false alarms on GitHub",
  summary:
    "Behind the scenes: when several changes were merged within minutes, GitHub used to cancel the earlier checks and shop updates and show them as red marks. Now every check finishes, and an older shop update that has been overtaken by a newer one simply steps aside, so the newest change is always what goes live. Nothing in the admin changes, and this has only been checked locally: the first real merge will confirm it.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
