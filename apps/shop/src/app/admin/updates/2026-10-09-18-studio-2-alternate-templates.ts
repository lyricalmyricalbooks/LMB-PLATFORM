import type { AppUpdate } from "../appUpdates";

export default {
  id: "studio-2-alternate-templates", date: "2026-10-09", title: "Different page layouts for different books and collections",
  summary: "Book pages and collection pages can now have more than one layout. In the Design studio, open a book page; Page layout shows a Book page template box — click New template from this one, name it (for example Poetry) and change its sections. Then choose it for any book in Books › edit › Categories & tags › Book page template, or for a category in Navigation › Shop categories › Edit › Collection page template. Every other book and category keeps the default layout. A new template starts as a copy of the default's sections and follows the default's colours and fonts unless you change them for that template (book pages only — collection templates have their own sections and use the default collection page's look). Templates can be renamed or deleted (with Undo); anything that used a deleted template goes back to the default. Like any design change, a new template reaches your shop when you publish. Tested with local checks only.",
  links: [{ label: "Open Page layout", tab: "settings", settingsTab: "designer", studio: "#designer?tab=sections" }, { label: "Open Books", tab: "catalog" }],
} satisfies AppUpdate;
