import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-list",
  date: "2026-11-11",
  title: "The Team page is a simple list of people",
  summary: "Settings › Team now shows one row per person, with their initials, email and role, as in the new design. The Settings pages also sit on the same cream page as the rest of the admin.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
