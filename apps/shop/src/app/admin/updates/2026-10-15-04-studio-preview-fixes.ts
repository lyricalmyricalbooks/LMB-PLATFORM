import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-preview-fixes",
  date: "2026-10-15",
  title: "Studio preview: fewer surprises while editing",
  summary: "On a phone, Studio's Outline tab now shows the page's sections under the row of tabs (they used to be pushed off the screen). Double-clicking text in the preview no longer shifts the shop out of view. Pressing Ctrl/⌘+S while typing in the preview no longer opens the browser's Save page window; Studio says to press Done first. Backspace on a focused button no longer deletes the selected section (the Delete key still does, and Backspace still works with nothing focused). A link typed as www.example.com in the preview's link box now goes to that website instead of a missing page on the shop. Section switches the shop shows by default (Bold, Uppercase, Show price and so on) now show as on in Studio until you turn them off, and the Slideshow autoplay speed starts at 2 seconds, the fastest the shop uses.",
  links: [{ label: "Open Studio", tab: "settings", settingsTab: "designer" }],
} satisfies AppUpdate;
