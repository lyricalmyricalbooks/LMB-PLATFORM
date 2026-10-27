import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-and-catalog-types",
  date: "2026-10-27",
  title: "Studio and the book list are checked more strictly",
  summary: "Behind the scenes, the spot where Studio builds its section settings panel, the quick price and stock edit in the book list, the footer link groups and the theme's page overrides now pass the code checker, so mistakes there are caught before they reach you. Known type problems dropped from 24 to 8. Nothing you see changes.",
  links: [{ label: "Open Theme settings", tab: "settings", settingsTab: "designer", studio: "#designer?tab=style" }],
} satisfies AppUpdate;
