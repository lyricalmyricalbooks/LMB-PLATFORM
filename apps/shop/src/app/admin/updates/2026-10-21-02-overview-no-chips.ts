import type { AppUpdate } from "../appUpdates";

export default {
  id: "overview-no-chips",
  date: "2026-10-21",
  title: "Overview: Visitors filter chips removed",
  summary: "The Visitors tab no longer has the row of filter chips (All, Right now, Where they come from and so on). It simply shows all its widgets, so the top of the Overview is calmer.",
  links: [{ label: "Open Overview", tab: "overview" }],
} satisfies AppUpdate;
