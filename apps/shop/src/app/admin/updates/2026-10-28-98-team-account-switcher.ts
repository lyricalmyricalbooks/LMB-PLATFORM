import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-account-switcher",
  date: "2026-10-28",
  title: "Your team sees your shop on their Colophon account",
  summary: "When Colophon runs your shop, people you add in Settings › Team now see your shop on their Colophon account page, with the role you gave them, and can open it from there. Change someone's role or remove them here or on the account page, and the change shows in both places. Nothing changes for a shop that runs on its own.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
