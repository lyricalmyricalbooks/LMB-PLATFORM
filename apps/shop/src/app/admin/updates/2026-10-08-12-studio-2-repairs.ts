import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-repairs", date: "2026-10-08", title: "Design studio repairs",
  summary: "Image uploads in the Design studio work again: pictures are shrunk automatically, and a clear message explains any failed upload. Section backgrounds and category pictures gained an Upload button. Linked shared blocks now show in every section type. A section that breaks no longer blanks the whole page. Unpublished pages can be designed and previewed. Built-in page parts switch to their phone layout at the same width as sections, so large phones held sideways (640–767 pixels wide) now show phone layouts. Featured product shows the shopper's currency. Creating a category while editing a book no longer publishes unrelated draft categories.",
  links: [{ label: "Open the Design studio", tab: "settings", settingsTab: "designer" }, { label: "Edit a book's categories", tab: "catalog" }],
} satisfies AppUpdate;
