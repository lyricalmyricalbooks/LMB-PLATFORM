import type { AppUpdate } from "../appUpdates";

export default {
  id: "release-countdown-folder",
  date: "2026-10-27",
  title: "Pre-order release countdown has its own folder",
  summary: "Behind the scenes, the \"Pre-order · out in 2d 5h\" countdown on book pages moved into a folder that keeps its code, words and Studio controls together. Its switch, its hours setting and its words in Studio stay where they were, and book pages look the same.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
