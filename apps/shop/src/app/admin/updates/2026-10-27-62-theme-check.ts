import type { AppUpdate } from "../appUpdates";

export default {
  id: "theme-check",
  date: "2026-10-27",
  title: "Every ready-made look can be fully adjusted, and hero banners get a Height setting",
  summary: "A new check makes sure that everything a ready-made look sets (colours, words, page layouts and starter pages) has a setting you can change afterwards in Design. It found one gap: the Punk look's home layout makes its hero banner shorter, but there was no setting for that. Hero banners now have Height (Full screen, Medium or Small). Existing hero banners keep their current size.",
  links: [{ label: "Open Design", tab: "settings", settingsTab: "designer", studio: "designer?t=heroPage&tab=sections" }],
} satisfies AppUpdate;
