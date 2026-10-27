import type { AppUpdate } from "../appUpdates";

export default {
  id: "team-author-role",
  date: "2026-10-27",
  title: "Add authors under Settings › Team",
  summary: "Settings › Team has a new Author role. An author can't open this admin; in the stockroom they see and update only the books that name them as the author, as before. Changing someone to a smaller role, or removing them, now signs them out so the old access stops sooner.",
  links: [{ label: "Open Team", tab: "settings", settingsTab: "team" }],
} satisfies AppUpdate;
