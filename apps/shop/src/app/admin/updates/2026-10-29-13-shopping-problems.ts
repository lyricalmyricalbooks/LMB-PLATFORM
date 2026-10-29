import type { AppUpdate } from "../appUpdates";

export default {
  id: "shopping-problems",
  date: "2026-10-29",
  title: "See which books Google Shopping isn't showing",
  summary: "Once Google is connected, Settings under Visitors & Google lists the books Google Shopping turned down, each with the reason and what to fix, such as a missing price. If there are none, it says so. It only reads from Google and never changes your books.",
  links: [{ label: "Open Google settings", tab: "settings", settingsTab: "general" }],
} satisfies AppUpdate;
