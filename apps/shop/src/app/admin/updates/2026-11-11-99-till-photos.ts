import type { AppUpdate } from "../appUpdates";

export default {
  id: "till-photos",
  date: "2026-11-11",
  title: "Photos on the till",
  summary: "Items with a cover photo now show it on their till tile, so you can find them at a glance. Items without one keep their initials.",
  links: [{ label: "Open Home", tab: "overview" }],
} satisfies AppUpdate;
