import type { AppUpdate } from "../appUpdates";

export default {
  id: "announcement-close",
  date: "2026-10-23",
  title: "Optional close button on the announcement bar",
  summary:
    "Like many Shopify themes, the announcement bar can now have a small × so shoppers who have read it can close it. It stays closed in that browser until you change the announcement messages, so a new offer always shows. You always see it in Design. Nothing changes until you switch on Design › Theme settings › Header & announcement bar › Close button on the announcement bar; the words read aloud for the button are in Text & labels › Header.",
  links: [
    { label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" },
  ],
} satisfies AppUpdate;
