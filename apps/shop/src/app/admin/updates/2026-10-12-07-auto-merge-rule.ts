import type { AppUpdate } from "../appUpdates";

export default {
  id: "auto-merge-rule",
  date: "2026-10-12",
  title: "Changes go live once their checks pass",
  summary:
    "Behind the scenes: changes made for you are now merged automatically as soon as all their automatic checks (tests, Studio checks and the release note) pass and they don't clash with other changes. A change with a failing check is never merged; it is fixed first. Once merged, the shop updates itself as usual. Nothing in the admin changes.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
