import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-undo-shortcuts-links", date: "2026-10-08", title: "Undo everywhere, shortcuts and Edit in Studio",
  summary: "Deleting a section or applying a theme in the Design studio now happens straight away with an Undo button, instead of a browser pop-up asking first. Undo and Redo say what they will change. Press ? in the studio for keyboard shortcuts (for example Delete, Alt+arrows to move a section, 1/2/3 for desktop, tablet and phone). While you're signed in, an \"Edit in Studio\" button on your live shop opens the studio on the page you're looking at, and a book's editor has \"Design this page\".",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }, { label: "Open a book to design its page", tab: "catalog" }],
} satisfies AppUpdate;
