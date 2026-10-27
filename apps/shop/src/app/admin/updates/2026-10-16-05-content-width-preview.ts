import type { AppUpdate } from "../appUpdates";

export default {
  id: "content-width-preview",
  date: "2026-10-16",
  title: "Content width now shows in Studio",
  summary: "Theme settings › Layout & spacing › Content width now works across its whole slider (800–1800px); before, the ends did nothing. Studio's desktop preview used to be a fixed 1200px screen, so wider settings looked the same. It now widens itself when the column wouldn't fit, and a new Screen width picker above the preview switches between Laptop (1200px), Large laptop (1440px) and Big monitor (1920px). A section's own Layout › Content width also applies to banners, the hero, slideshows, newsletter, countdown and custom HTML sections.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
