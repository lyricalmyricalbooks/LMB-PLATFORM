import type { AppUpdate } from "../appUpdates";

export default {
  id: "content-width-wider",
  date: "2026-10-16",
  title: "Content width goes up to 2560px",
  summary: "Theme settings › Layout & spacing › Content width (and the shop masthead's Header width) now reach 2560px instead of stopping at 1800px, so the column can come right out to the edge of big screens. The preview's Screen width picker adds an Extra-wide monitor (2560px) choice so you can see it. Also fixed: clicking the page background in the preview and pressing Open in Theme settings always went to Colours; it now offers one button each for Colours, Typography and Layout & spacing (where Space between sections lives).",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
