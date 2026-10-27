import type { AppUpdate } from "../appUpdates";

export default {
  id: "admin-api-loop",
  date: "2026-10-27",
  title: "The admin's database file no longer loops back on itself",
  summary: "Behind the scenes, the admin's shared database file and the Studio theme store used to load each other, a loop that can leave one half not ready when a screen opens. The activity history they both write to now has its own small file, so the loop is gone, and a new automatic check stops any change that brings a loop back. Saving, publishing and the History list work as before.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
