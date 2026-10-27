import type { AppUpdate } from "../appUpdates";

export default {
  id: "bag-photos-switch",
  date: "2026-10-25",
  title: "Choose whether the bag shows book photos",
  summary: "The shopping bag's book rows have a new switch, Show a photo beside each book in the bag. It is on, so the bag looks exactly as before; turn it off for a plainer, text-only order slip. Find it in Settings › Design › Theme settings › Cart drawer (shopping bag) › Book rows.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
