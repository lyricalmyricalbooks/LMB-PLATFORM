import type { AppUpdate } from "../appUpdates";

export default {
  id: "one-preview-listener",
  date: "2026-10-25",
  title: "Studio's live preview runs on one shared link",
  summary: "Every part of the shop that follows your unsaved Studio design (pages, checkout, the draft banner, the error screen) now listens through one shared connection that checks each update the same way. Nothing looks different; it removes a source of preview glitches where one part of the page kept the old look.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
