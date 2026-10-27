import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-page-text-movable",
  date: "2026-10-15",
  title: "Studio: put sections below a page's text",
  summary: "On a custom page (About, History…), the title and text you write in Pages used to sit below every section, so a picture collage or any other section could never go underneath it. Now, adding a section to the page turns that text into a “Page content” section at the same spot, so nothing moves until you do: drag it, or use Move up / Move down, to put sections above or below it. Pages that already have sections show a “Make page text movable” button at the top of Page layout.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
