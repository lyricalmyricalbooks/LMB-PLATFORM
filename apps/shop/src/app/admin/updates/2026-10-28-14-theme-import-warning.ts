import type { AppUpdate } from "../appUpdates";

export default {
  id: "theme-import-warning",
  date: "2026-10-28",
  title: "Importing a theme file now tells you what you couldn't change",
  summary: "When you import a theme file in Design › Themes › My themes, Studio now checks it first. If the file holds settings Studio has no control for, text that isn't in Text & labels, or sections Studio doesn't have, it names them in plain words and asks before adding the theme. Choose Import anyway to add it, or Cancel to leave My themes as it was. Files exported from Studio itself import without a warning.",
  links: [
    { label: "Open Themes", tab: "settings", settingsTab: "designer", studio: "designer?tab=themes" },
  ],
} satisfies AppUpdate;
