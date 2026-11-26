import type { AppUpdate } from "../appUpdates";

export default {
  id: "steadier-studio-check",
  date: "2026-11-26",
  title: "A steadier check on the shopping bag's colours",
  summary: "Maintenance: the automatic check that the shopping bag keeps its own background in Studio now waits for the bag's settings to open, so it no longer fails by chance. Nothing changes in your shop.",
  links: [{ label: "Open your website", tab: "design" }],
} satisfies AppUpdate;
