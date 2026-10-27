import type { AppUpdate } from "../appUpdates";

export default {
  id: "remove-edit-in-studio-button",
  date: "2026-10-12",
  title: "The floating “Edit in Studio” button is gone",
  summary:
    "When you were signed in as the owner, a small “Edit in Studio” button floated in the corner of the live shop. It's been removed, so the shop looks the same to you as it does to shoppers. You can still open the Design studio from Settings › Design, or from Books › edit › Design this page.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
