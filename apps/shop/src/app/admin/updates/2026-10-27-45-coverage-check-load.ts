import type { AppUpdate } from "../appUpdates";

export default {
  id: "coverage-check-load",
  date: "2026-10-27",
  title: "The Studio editing check no longer fails at random",
  summary: "Maintenance only: the automatic check that every page section can be edited in Studio used to count the time it took to load Studio's section list against its own time limit, so it sometimes failed when the test machine was busy. It now loads that list first and checks exactly the same thing, so fixes reach your shop without needless delays.",
  links: [{ label: "Open Design", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
