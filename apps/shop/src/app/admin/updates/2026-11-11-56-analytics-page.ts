import type { AppUpdate } from "../appUpdates";

export default {
  id: "analytics-page",
  date: "2026-11-11",
  title: "A new Analytics page for your shop's visitors",
  summary: "Analytics now has its own place in the menu. Pick a period to see how many people visited, how many bought something, visitors per day, where they came from, which products they looked at, their devices, how far they got towards buying and what they searched for. It uses Google Analytics when it is connected, and your shop's own visit counter otherwise. Anything not recorded yet says so instead of showing a zero.",
  links: [{ label: "Open Analytics", tab: "analytics" }],
} satisfies AppUpdate;
