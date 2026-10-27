import type { AppUpdate } from "../appUpdates";

export default {
  id: "unused-code-cleanup",
  date: "2026-10-27",
  title: "Leftover code cleared from five files",
  summary: "Behind the scenes, unused leftovers were removed from shop settings, reviews, the shop home page, book pages and checkout, cutting the automatic code check's list of known problems from 234 to 94. Nothing you see changes; new mistakes in those files now stand out instead of hiding in the old noise.",
  links: [{ label: "Open settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
